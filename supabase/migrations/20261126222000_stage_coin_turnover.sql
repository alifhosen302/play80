-- Record turnover without changing existing wallets or historical requirements.
-- Apply future verified wins to outstanding legacy progress before new turnover items.
-- Enable the withdrawal guard only after all games can settle wins on the server.
create table private.play80_turnover_settings (
  singleton boolean primary key default true check (singleton),
  withdrawal_guard_enabled boolean not null default false
);
insert into private.play80_turnover_settings default values;

create table private.play80_turnover_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('deposit','first_deposit_bonus','daily_bonus','referral_bonus')),
  source_key text not null,
  coins bigint not null check (coins>0),
  required bigint generated always as (coins * (case when source='deposit' then 1 else 3 end)) stored,
  completed bigint not null default 0 check (completed>=0 and completed<=required),
  created_at timestamptz not null default clock_timestamp(),
  primary key (source,source_key)
);
create index play80_turnover_open_items on private.play80_turnover_items(user_id,created_at,source,source_key)
where completed<required;

revoke all on private.play80_turnover_items, private.play80_turnover_settings from public, anon, authenticated;

create function private.play80_record_turnover(p_user uuid,p_source text,p_key text,p_coins bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.demo_wallets where user_id=p_user for update;
  insert into private.play80_turnover_items(user_id,source,source_key,coins)
  values(p_user,p_source,p_key,p_coins) on conflict (source,source_key) do nothing;
end;
$$;
revoke all on function private.play80_record_turnover(uuid,text,text,bigint) from public,anon,authenticated;

create function private.play80_turnover_credit_source()
returns trigger language plpgsql security definer set search_path='' as $$
declare due_at timestamptz;
begin
  if tg_table_name='demo_wallet_requests' then
    if new.status='approved' and old.status='pending' and new.request_kind='demo_credit' then
      perform private.play80_record_turnover(new.user_id,'deposit',new.id::text,new.amount);
    end if;
  elsif tg_table_name='bonus_transactions' then
    if new.bonus_kind='first_exact_1000_demo_credit' then
      perform private.play80_record_turnover(new.user_id,'first_deposit_bonus',new.id::text,new.amount);
    end if;
  elsif tg_table_name='play80_referral_awards' then
    perform private.play80_record_turnover(new.referrer,'referral_bonus',new.new_player::text,500);
  elsif tg_table_name='play80_daily_reward_clock' then
    due_at:=old.next_at;
    while due_at<new.next_at loop
      perform private.play80_record_turnover(new.user_id,'daily_bonus',
        new.user_id::text||':'||extract(epoch from due_at)::text,50);
      due_at:=due_at+interval '24 hours';
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.play80_turnover_credit_source() from public,anon,authenticated;

-- Register the deposit before its optional bonus, so wins pay the deposit first.
create trigger play80_a_turnover_on_deposit after update of status on public.demo_wallet_requests
for each row execute function private.play80_turnover_credit_source();
create trigger play80_turnover_on_first_bonus after insert on public.bonus_transactions
for each row execute function private.play80_turnover_credit_source();
create trigger play80_turnover_on_referral after insert on private.play80_referral_awards
for each row execute function private.play80_turnover_credit_source();
create trigger play80_turnover_on_daily after update of next_at on private.play80_daily_reward_clock
for each row execute function private.play80_turnover_credit_source();

CREATE OR REPLACE FUNCTION private.play80_demo_credit_bonus_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_bonus uuid;v_balance bigint;
BEGIN
 IF NEW.status='approved' AND OLD.status='pending' AND NEW.request_kind='demo_credit' THEN
    IF NEW.amount=1000 AND NOT EXISTS(SELECT 1 FROM public.demo_wallet_requests q WHERE q.user_id=NEW.user_id
        AND q.id<>NEW.id AND q.request_kind='demo_credit' AND q.status='approved') THEN
      INSERT INTO public.bonus_transactions(user_id,request_id,bonus_kind,amount)
        VALUES(NEW.user_id,NEW.id,'first_exact_1000_demo_credit',5000)
        ON CONFLICT(user_id,bonus_kind) DO NOTHING RETURNING id INTO v_bonus;
      IF v_bonus IS NOT NULL THEN
        UPDATE public.demo_wallets SET balance=balance+5000,updated_at=now()
          WHERE user_id=NEW.user_id RETURNING balance INTO v_balance;
        INSERT INTO public.wallet_transactions(user_id,transaction_type,delta,balance_after,operation_key,description)
          VALUES(NEW.user_id,'first_demo_credit_bonus',5000,v_balance,
            'first_bonus:'||NEW.user_id,'One-time nonredeemable virtual bonus');
      END IF;
    END IF;
 END IF;
 RETURN NEW;
END$function$
;

-- The existing wallet transaction trigger sees server-settled tournament prizes.
-- No client-callable RPC accepts a win amount.
create or replace function private.play80_turnover_on_entry()
returns trigger language plpgsql security definer set search_path='' as $$
declare item record;
declare remaining_win bigint := new.delta;
declare applied bigint;
begin
  if new.transaction_type<>'tournament_reward' or remaining_win<=0 then return new; end if;
  select least(remaining_win, required-completed) into applied
  from public.turnover_records where user_id=new.user_id and completed<required for update;
  if found then
    update public.turnover_records set completed=completed+applied,updated_at=now()
    where user_id=new.user_id;
    remaining_win:=remaining_win-applied;
    if remaining_win=0 then return new; end if;
  end if;
  for item in
    select source,source_key,required-completed as remaining
    from private.play80_turnover_items where user_id=new.user_id and completed<required
    order by created_at,source,source_key for update
  loop
    applied:=least(remaining_win,item.remaining);
    update private.play80_turnover_items set completed=completed+applied
    where source=item.source and source_key=item.source_key;
    remaining_win:=remaining_win-applied;
    exit when remaining_win=0;
  end loop;
  return new;
end;
$$;
revoke all on function private.play80_turnover_on_entry() from public,anon,authenticated;

create function private.play80_guard_turnover_withdrawal()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.request_kind='demo_debit' and new.status in ('pending','approved')
    and (select withdrawal_guard_enabled from private.play80_turnover_settings where singleton)
  then
    perform 1 from public.demo_wallets where user_id=new.user_id for update;
    if exists(select 1 from private.play80_turnover_items where user_id=new.user_id and completed<required)
      or exists(select 1 from public.turnover_records where user_id=new.user_id and completed<required) then
      raise exception 'PLAY80_TURNOVER_PENDING';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.play80_guard_turnover_withdrawal() from public,anon,authenticated;
create trigger play80_turnover_withdrawal_guard before insert or update of status on public.demo_wallet_requests
for each row execute function private.play80_guard_turnover_withdrawal();

create function public.play80_my_turnover()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'withdrawal_guard_enabled',(select withdrawal_guard_enabled from private.play80_turnover_settings where singleton),
    'items',coalesce(jsonb_agg(jsonb_build_object('source',source,'coins',coins,'required',required,
      'completed',completed,'created_at',created_at) order by created_at,source,source_key),'[]'::jsonb))
  from (
    select source,source_key,coins,required,completed,created_at
    from private.play80_turnover_items
    where user_id=auth.uid() and completed<required
    union all
    select 'legacy',user_id::text,required,required,completed,'-infinity'::timestamptz
    from public.turnover_records
    where user_id=auth.uid() and completed<required
  ) as pending;
$$;
revoke all on function public.play80_my_turnover() from public,anon;
grant execute on function public.play80_my_turnover() to authenticated;
