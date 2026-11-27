-- Daily virtual rewards accrue into a claim queue; previously credited wallets stay unchanged.
-- Each due period is independently claimable; claimed rows remain for replay protection and audit.
create table private.play80_daily_bonus_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  due_at timestamptz not null,
  claimed_at timestamptz,
  primary key(user_id,due_at)
);
create index play80_daily_bonus_pending on private.play80_daily_bonus_claims(user_id,due_at) where claimed_at is null;
revoke all on private.play80_daily_bonus_claims from public,anon,authenticated;
-- Turnover belongs to the actual wallet credit, not the accrual clock.
alter table private.play80_daily_reward_clock disable trigger play80_turnover_on_daily;

create function private.play80_accrue_daily_bonus(p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
declare due timestamptz;
declare cycles bigint;
begin
  select c.next_at into due from private.play80_daily_reward_clock c
  join auth.users u on u.id=c.user_id join public.demo_wallets w on w.user_id=c.user_id
  where c.user_id=p_user and u.email_confirmed_at is not null and not u.is_anonymous
    and (u.banned_until is null or u.banned_until<=now())
    and coalesce(u.raw_app_meta_data->>'role','player')='player'
  for update of c;
  if not found or due>now() then return; end if;
  cycles:=floor(extract(epoch from (now()-due))/86400)::bigint+1;
  insert into private.play80_daily_bonus_claims(user_id,due_at)
  select p_user,due+i*interval '24 hours' from generate_series(0::bigint,cycles-1) as g(i)
  on conflict do nothing;
  update private.play80_daily_reward_clock
  set next_at=due+cycles*interval '24 hours'
  where user_id=p_user;
end;
$$;
revoke all on function private.play80_accrue_daily_bonus(uuid) from public,anon,authenticated;

-- Retain the existing scheduled job, but accrue rather than auto-credit.
create or replace function private.play80_award_daily_coins()
returns void language plpgsql security definer set search_path='' as $$
declare reward record;
begin
  for reward in
    select c.user_id from private.play80_daily_reward_clock c
    join auth.users u on u.id=c.user_id join public.demo_wallets w on w.user_id=c.user_id
    where c.next_at<=now() and u.email_confirmed_at is not null and not u.is_anonymous
      and (u.banned_until is null or u.banned_until<=now())
      and coalesce(u.raw_app_meta_data->>'role','player')='player'
    order by c.next_at,c.user_id limit 1000 for update of c skip locked
  loop
    perform private.play80_accrue_daily_bonus(reward.user_id);
  end loop;
end;
$$;

create or replace function public.play80_my_rewards()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.play80_accrue_daily_bonus(auth.uid());
  select jsonb_build_object('server_at',now(),'next_at',c.next_at,
    'pending_periods',coalesce((select jsonb_agg(b.due_at order by b.due_at)
      from private.play80_daily_bonus_claims b where b.user_id=u.id and b.claimed_at is null),'[]'::jsonb),
    'first_claimed',exists(select 1 from public.bonus_transactions b
      where b.user_id=u.id and b.bonus_kind='first_exact_1000_demo_credit'),
    'referral_code',p.username,
    'referral_count',(select count(*) from private.play80_referral_awards a where a.referrer=u.id))
  into result
  from auth.users u join public.profiles p on p.id=u.id
  left join private.play80_daily_reward_clock c on c.user_id=u.id
  where u.id=auth.uid() and u.email_confirmed_at is not null and not u.is_anonymous
    and (u.banned_until is null or u.banned_until<=now())
    and coalesce(u.raw_app_meta_data->>'role','player')='player';
  return result;
end;
$$;
revoke all on function public.play80_my_rewards() from public,anon;
grant execute on function public.play80_my_rewards() to authenticated;

create function public.play80_claim_daily_bonus(p_due_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare player_id uuid:=auth.uid();
declare due timestamptz;
declare credited bigint:=0;
begin
  if player_id is null then raise exception 'Login required'; end if;
  perform private.play80_accrue_daily_bonus(player_id);
  update private.play80_daily_bonus_claims b set claimed_at=now()
  where b.user_id=player_id and b.due_at=p_due_at and b.claimed_at is null
    and exists(select 1 from auth.users u join public.demo_wallets w on w.user_id=u.id
      where u.id=player_id and u.email_confirmed_at is not null and not u.is_anonymous
      and (u.banned_until is null or u.banned_until<=now())
      and coalesce(u.raw_app_meta_data->>'role','player')='player')
  returning b.due_at into due;
  if found then
    perform private.play80_credit_reward(player_id,50);
    perform private.play80_record_turnover(player_id,'daily_bonus',
      player_id::text||':'||extract(epoch from due)::text,50);
    credited:=50;
  end if;
  return jsonb_build_object('claimed',credited,'rewards',public.play80_my_rewards());
end;
$$;
revoke all on function public.play80_claim_daily_bonus(timestamptz) from public,anon;
grant execute on function public.play80_claim_daily_bonus(timestamptz) to authenticated;


-- A bonus-linked first deposit is one 3x item. Later ordinary deposits remain 1x.
-- Existing historical rows require an explicitly reconciled backfill, not a blind reset.
create or replace function private.play80_turnover_credit_source()
returns trigger language plpgsql security definer set search_path='' as $$
declare due_at timestamptz;
declare deposit_amount bigint;
begin
  if tg_table_name='demo_wallet_requests' then
    if new.status='approved' and old.status='pending' and new.request_kind='demo_credit' then
      perform private.play80_record_turnover(new.user_id,'deposit',new.id::text,new.amount);
    end if;
  elsif tg_table_name='bonus_transactions' then
    if new.bonus_kind='first_exact_1000_demo_credit' then
      select q.amount into strict deposit_amount
      from public.demo_wallet_requests q
      where q.id=new.request_id and q.user_id=new.user_id
        and q.status='approved' and q.request_kind='demo_credit';
      -- The deposit trigger has already registered its 1x item. Convert that
      -- item into the single 3x deposit-plus-bonus item, keeping any progress.
      perform 1 from public.demo_wallets where user_id=new.user_id for update;
      update private.play80_turnover_items
        set source='first_deposit_bonus',source_key=new.id::text,
            coins=deposit_amount+new.amount
        where user_id=new.user_id and source='deposit'
          and source_key=new.request_id::text;
      if not found then
        perform private.play80_record_turnover(new.user_id,'first_deposit_bonus',
          new.id::text,deposit_amount+new.amount);
      end if;
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

-- Only completed, server-recorded owner sends count as ordinary 1x virtual deposits.
-- Generic wallet adjustments, bonus credits and reverse transfers are not deposits.
create function private.play80_turnover_owner_send()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.direction='send' and old.destination_after is null
    and new.destination_after is not null and new.source_after is not null
    and new.amount>0 then
    perform private.play80_record_turnover(new.player_id,'deposit',
      'owner_transfer:'||new.operation_id::text,new.amount);
  end if;
  return new;
end;
$$;
revoke all on function private.play80_turnover_owner_send() from public,anon,authenticated;
create trigger play80_turnover_owner_send after update of destination_after
on private.play80_owner_transfers for each row execute function private.play80_turnover_owner_send();

-- The legacy owner-grant RPC records its unique key and credit atomically.
create function private.play80_turnover_owner_grant()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.amount>0 and exists(select 1 from auth.users u
    where u.id=new.target_user_id and u.email_confirmed_at is not null
      and not u.is_anonymous and coalesce(u.raw_app_meta_data->>'role','player')='player') then
    perform private.play80_record_turnover(new.target_user_id,'deposit',
      'owner_grant:'||new.operation_id::text,new.amount);
  end if;
  return new;
end;
$$;
revoke all on function private.play80_turnover_owner_grant() from public,anon,authenticated;
create trigger play80_turnover_owner_grant after insert on private.staff_coin_transfer_keys
for each row execute function private.play80_turnover_owner_grant();


-- A completed source unlocks its own original demo coin amount, not its 3x
-- gameplay requirement. While any source is open, only unused completed-source
-- coins are withdrawable. With no open source, the whole unheld wallet is free.
-- Preserve zero-balance closures and spent allowances as audit history.
alter table private.play80_turnover_items
  add column voided_at timestamptz,
  add column released_used bigint not null default 0 check(released_used>=0 and released_used<=coins);
alter table public.turnover_records
  add column closed_at timestamptz,
  add column close_reason text check(close_reason in ('zero_balance','reconciled'));

create function private.play80_open_turnover(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.play80_turnover_items
    where user_id=p_user and voided_at is null and completed<required)
  or exists(select 1 from public.turnover_records
    where user_id=p_user and closed_at is null and completed<required);
$$;
revoke all on function private.play80_open_turnover(uuid) from public,anon,authenticated;

create function private.play80_released_coins(p_user uuid)
returns bigint language sql stable security definer set search_path='' as $$
  select coalesce(sum(coins-released_used),0)::bigint
  from private.play80_turnover_items
  where user_id=p_user and voided_at is null and completed=required;
$$;
revoke all on function private.play80_released_coins(uuid) from public,anon,authenticated;

create function private.play80_withdrawable_coins(p_user uuid)
returns bigint language sql stable security definer set search_path='' as $$
  select greatest(0,least(w.balance-w.held_balance,
    case when private.play80_open_turnover(p_user)
      then private.play80_released_coins(p_user)-w.held_balance
      else w.balance-w.held_balance end))
  from public.demo_wallets w where w.user_id=p_user;
$$;
revoke all on function private.play80_withdrawable_coins(uuid) from public,anon,authenticated;

-- Reserve existing wallet holds at request creation. At approval the existing
-- staff RPC has already debited the balance and released that request's hold;
-- consume released allowances exactly once in the same transaction.
create or replace function private.play80_guard_turnover_withdrawal()
returns trigger language plpgsql security definer set search_path='' as $$
declare guarded boolean;
declare held bigint;
declare remaining bigint;
declare take_coins bigint;
declare item record;
begin
  if new.request_kind<>'demo_debit' then return new; end if;
  select withdrawal_guard_enabled into guarded from private.play80_turnover_settings where singleton;
  select held_balance into held from public.demo_wallets where user_id=new.user_id for update;
  if not found then raise exception 'Wallet missing'; end if;
  if tg_op='INSERT' and new.status='pending' then
    if guarded and new.amount>coalesce(private.play80_withdrawable_coins(new.user_id),0)
      then raise exception 'PLAY80_TURNOVER_PENDING'; end if;
  elsif tg_op='UPDATE' and old.status='pending' and new.status='approved' then
    if guarded and private.play80_open_turnover(new.user_id)
      and private.play80_released_coins(new.user_id)<new.amount+held
      then raise exception 'PLAY80_TURNOVER_PENDING'; end if;
    remaining:=new.amount;
    for item in select source,source_key,coins-released_used as available
      from private.play80_turnover_items
      where user_id=new.user_id and voided_at is null and completed=required and released_used<coins
      order by created_at desc,source_key desc,source desc for update
    loop
      take_coins:=least(remaining,item.available);
      update private.play80_turnover_items set released_used=released_used+take_coins
        where source=item.source and source_key=item.source_key;
      remaining:=remaining-take_coins;
      exit when remaining=0;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.play80_guard_turnover_withdrawal() from public,anon,authenticated;

create function private.play80_close_zero_balance_turnover()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.balance>0 and new.balance=0 and new.held_balance=0 then
    update private.play80_turnover_items set voided_at=clock_timestamp()
      where user_id=new.user_id and voided_at is null;
    update public.turnover_records set closed_at=clock_timestamp(),close_reason='zero_balance'
      where user_id=new.user_id and closed_at is null;
  end if;
  return new;
end;
$$;
revoke all on function private.play80_close_zero_balance_turnover() from public,anon,authenticated;
create trigger play80_close_zero_balance_turnover after update of balance on public.demo_wallets
for each row execute function private.play80_close_zero_balance_turnover();

-- A verified historical correction: only accounts with zero recorded progress,
-- no staged source items, no verified wins or debits and a balance equal to the
-- exact audited credits can be safely reconstructed. Nothing is deleted.
-- Historical transfers lack created_at; use the associated audit event time.
-- Only reconcile the one exact, previously verified deposit/owner-send pair.
do $$
declare account_id uuid;
declare credit_at timestamptz;
declare send_at timestamptz;
begin
  select q.user_id,q.reviewed_at into account_id,credit_at
  from public.demo_wallet_requests q
  join public.bonus_transactions b on b.request_id=q.id and b.user_id=q.user_id
  join private.play80_owner_transfers o on o.player_id=q.user_id
  join public.turnover_records r on r.user_id=q.user_id
  join public.demo_wallets w on w.user_id=q.user_id
  where q.id='6b53c901-cae4-4957-b81a-f0c70ff83f2d'::uuid and q.status='approved'
    and q.request_kind='demo_credit' and q.amount=1000
    and b.id='127d880e-ca01-4971-a441-293020aef555'::uuid and b.amount=5000
    and o.operation_id='d9042dcd-f1d5-4141-9724-8c162ef581b1'::uuid and o.direction='send'
    and o.amount=500 and o.destination_after is not null
    and r.required=2000 and r.completed=0 and r.closed_at is null
    and w.balance=6500 and w.held_balance=0
    and not exists(select 1 from private.play80_turnover_items i where i.user_id=q.user_id)
    and not exists(select 1 from public.wallet_transactions t where t.user_id=q.user_id and t.transaction_type='tournament_reward')
    and not exists(select 1 from public.demo_wallet_requests d where d.user_id=q.user_id and d.request_kind='demo_debit');
  if account_id is not null then
    perform 1 from public.demo_wallets where user_id=account_id for update;
    select a.created_at into send_at from public.owner_audit_log a
      where a.action='owner_transfer_demo_coins' and a.object_id=account_id
        and a.details->>'operation_id'='d9042dcd-f1d5-4141-9724-8c162ef581b1'
      order by a.created_at limit 1;
    if send_at is null or send_at<credit_at then raise exception 'Historical transfer audit timestamp missing or inconsistent'; end if;
    insert into private.play80_turnover_items(user_id,source,source_key,coins,created_at)
      values(account_id,'first_deposit_bonus','127d880e-ca01-4971-a441-293020aef555',6000,credit_at),
        (account_id,'deposit','owner_transfer:d9042dcd-f1d5-4141-9724-8c162ef581b1',500,send_at);
    update public.turnover_records set closed_at=clock_timestamp(),close_reason='reconciled'
      where user_id=account_id and closed_at is null;
  end if;
end $$;

-- For server-verified virtual tournament rewards, allocate newest item first.
-- Settlement counts only server-verified tournament wins. Other games remain demo practice.
create or replace function private.play80_turnover_on_entry()
returns trigger language plpgsql security definer set search_path='' as $$
declare item record;
declare remaining_win bigint := new.delta;
declare applied bigint;
begin
  if new.transaction_type<>'tournament_reward' or remaining_win<=0 then return new; end if;
  for item in
    select source,source_key,required-completed as remaining
    from private.play80_turnover_items where user_id=new.user_id and completed<required and voided_at is null
    order by created_at desc,source_key desc,source desc for update
  loop
    applied:=least(remaining_win,item.remaining);
    update private.play80_turnover_items set completed=completed+applied
    where source=item.source and source_key=item.source_key;
    remaining_win:=remaining_win-applied;
    exit when remaining_win=0;
  end loop;
  if remaining_win>0 then
  select least(remaining_win, required-completed) into applied
  from public.turnover_records where user_id=new.user_id and completed<required and closed_at is null for update;
  if found then
    update public.turnover_records set completed=completed+applied,updated_at=now()
    where user_id=new.user_id;
    remaining_win:=remaining_win-applied;

  end if;
  end if;
  return new;
end;
$$;
create or replace function public.play80_my_turnover()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'withdrawal_guard_enabled',(select withdrawal_guard_enabled from private.play80_turnover_settings where singleton),
    'withdrawable_coins',coalesce(private.play80_withdrawable_coins(auth.uid()),0),
    'items',coalesce(jsonb_agg(jsonb_build_object('source',source,'coins',coins,'required',required,
      'completed',completed,'created_at',created_at) order by created_at desc,source_key desc,source desc),'[]'::jsonb))
  from (
    select source,source_key,coins,required,completed,created_at
    from private.play80_turnover_items
    where user_id=auth.uid() and completed<required and voided_at is null
    union all
    select 'legacy',user_id::text,required,required,completed,'-infinity'::timestamptz
    from public.turnover_records
    where user_id=auth.uid() and completed<required and closed_at is null
  ) as pending;
$$;
