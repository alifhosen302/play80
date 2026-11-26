-- Keep wallet awards and their audit entries in the same transaction.
create table private.play80_daily_reward_clock (
  user_id uuid primary key references auth.users(id) on delete cascade,
  next_at timestamptz not null
);
create index play80_daily_reward_due on private.play80_daily_reward_clock(next_at, user_id);
create table private.play80_referral_awards (
  new_player uuid primary key references auth.users(id) on delete cascade,
  referrer uuid not null references auth.users(id) on delete cascade,
  awarded_at timestamptz not null default now()
);

create function private.play80_credit_reward(p_user uuid, p_amount bigint)
returns void language sql security definer set search_path = '' as $$
  with credited as (
    update public.demo_wallets set balance = balance + p_amount
    where user_id = p_user returning balance
  )
  insert into public.demo_wallet_ledger(user_id, delta, balance_after, reason)
  select p_user, p_amount, balance, 'demo_adjustment' from credited;
$$;
revoke all on function private.play80_credit_reward(uuid,bigint) from public, anon, authenticated;

insert into private.play80_daily_reward_clock(user_id, next_at)
select u.id, now()+interval '24 hours' from auth.users u
join public.demo_wallets w on w.user_id=u.id
where u.email_confirmed_at is not null and not u.is_anonymous
  and coalesce(u.raw_app_meta_data->>'role','player')='player';

create function private.play80_register_player_rewards()
returns trigger language plpgsql security definer set search_path = '' as $$
declare sponsor uuid;
begin
  if new.email_confirmed_at is null or new.is_anonymous
    or coalesce(new.raw_app_meta_data->>'role','player') <> 'player' then return new;
  end if;
  if tg_op='UPDATE' and old.email_confirmed_at is not null then return new; end if;

  insert into private.play80_daily_reward_clock values(new.id, now()+interval '24 hours')
  on conflict do nothing;

  select u.id into sponsor from auth.users u
    join public.profiles p on p.id=u.id join public.demo_wallets w on w.user_id=u.id
    where p.username=lower(btrim(new.raw_user_meta_data->>'play80_referral'))
    and u.id<>new.id and u.created_at<new.created_at and u.email_confirmed_at is not null
    and not u.is_anonymous and (u.banned_until is null or u.banned_until<=now())
    and coalesce(u.raw_app_meta_data->>'role','player')='player';

  if sponsor is not null then
    insert into private.play80_referral_awards(new_player, referrer) values(new.id, sponsor)
    on conflict do nothing;
    if found then perform private.play80_credit_reward(sponsor,500); end if;
  end if;
  return new;
end;
$$;
revoke all on function private.play80_register_player_rewards() from public, anon, authenticated;
-- This trigger sorts after the existing profile/wallet creation trigger.
create trigger play80_register_player_rewards after insert or update of email_confirmed_at on auth.users
  for each row execute function private.play80_register_player_rewards();

create function private.play80_award_daily_coins()
returns void language plpgsql security definer set search_path = '' as $$
declare reward record;
declare cycles bigint;
begin
  for reward in
    select c.user_id,c.next_at from private.play80_daily_reward_clock c
    join auth.users u on u.id=c.user_id join public.demo_wallets w on w.user_id=c.user_id
    where c.next_at<=now() and u.email_confirmed_at is not null and not u.is_anonymous
      and (u.banned_until is null or u.banned_until<=now())
      and coalesce(u.raw_app_meta_data->>'role','player')='player'
    order by c.next_at, c.user_id limit 1000 for update of c skip locked
  loop
    cycles := floor(extract(epoch from (now()-reward.next_at))/86400)::bigint+1;
    perform private.play80_credit_reward(reward.user_id, cycles*50);
    update private.play80_daily_reward_clock set next_at=reward.next_at+cycles*interval '24 hours'
      where user_id=reward.user_id;
  end loop;
end;
$$;
revoke all on function private.play80_award_daily_coins() from public, anon, authenticated;
select cron.schedule('play80-daily-virtual-coins','* * * * *','select private.play80_award_daily_coins()');

create function public.play80_my_rewards()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('server_at',now(), 'next_at',c.next_at,
    'first_claimed', exists(select 1 from public.bonus_transactions b
      where b.user_id=u.id and b.bonus_kind='first_exact_1000_demo_credit'),
    'referral_code', p.username,
    'referral_count', (select count(*) from private.play80_referral_awards a where a.referrer=u.id))
  from auth.users u join public.profiles p on p.id=u.id
  left join private.play80_daily_reward_clock c on c.user_id=u.id
  where u.id=auth.uid() and u.email_confirmed_at is not null and not u.is_anonymous
    and coalesce(u.raw_app_meta_data->>'role','player')='player';
$$;
revoke all on function public.play80_my_rewards() from public, anon;
grant execute on function public.play80_my_rewards() to authenticated;

create index play80_support_messages_thread on public.play80_support_messages(user_id,created_at desc,id desc);
create view private.play80_support_threads as
select latest.user_id, latest.id as latest_id, latest.body as preview, latest.created_at as at,
  coalesce(state.unread,false) or (last_incoming is not null and
    (last_reply is null or last_incoming>=last_reply)) as needs_attention,
  state.message_count
from (select distinct on (user_id) user_id,id,body,created_at from public.play80_support_messages
      order by user_id,created_at desc,id desc) latest
join (select user_id,count(*) message_count,
      bool_or(owner_read_at is null) filter(where sender_role='player') unread,
      max(created_at) filter(where sender_role='player') last_incoming,
      max(created_at) filter(where sender_role='owner') last_reply
      from public.play80_support_messages group by user_id) state using(user_id);

create function private.play80_lock_support_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,803));
  new.created_at := clock_timestamp();
  return new;
end;
$;
revoke all on function private.play80_lock_support_insert() from public, anon, authenticated;
create trigger play80_support_lock_insert before insert on public.play80_support_messages
for each row execute function private.play80_lock_support_insert();

create function public.play80_owner_threads(p_search text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.play80_require_staff_read();
  if private.staff_role(auth.uid()) is distinct from 'owner' then raise exception 'Owner access required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.needs_attention desc,t.at desc)
    from (select s.user_id, s.latest_id, left(s.preview,120) preview, s.at,
      s.needs_attention, s.message_count, p.username
      from private.play80_support_threads s left join public.profiles p on p.id=s.user_id
      where coalesce(btrim(p_search),'')='' or s.user_id::text ilike '%'||btrim(p_search)||'%'
          or p.username ilike '%'||btrim(p_search)||'%'
      order by s.needs_attention desc,s.at desc limit 100) t),'[]'::jsonb);
end;
$$;

create function public.play80_owner_open_thread(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.play80_require_staff_read();
  if private.staff_role(auth.uid()) is distinct from 'owner' then raise exception 'Owner access required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,803));
  update public.play80_support_messages set owner_read_at=now()
    where user_id=p_user and sender_role='player' and owner_read_at is null;
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at,t.id)
    from (select id,sender_role,body,category,created_at from public.play80_support_messages
      where user_id=p_user order by created_at desc,id desc limit 100) t),'[]'::jsonb);
end;
$$;

create function public.play80_owner_delete_thread(p_user uuid,p_latest uuid,p_count bigint,p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.play80_require_staff_read();
  if private.staff_role(auth.uid()) is distinct from 'owner' then raise exception 'Owner access required'; end if;
  if not private.play80_check_login_pin(p_pin) then return jsonb_build_object('ok',false); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,803));
  if not exists (select 1 from private.play80_support_threads
      where user_id=p_user and latest_id=p_latest and message_count=p_count and not needs_attention)
    then raise exception 'Conversation changed or still needs a reply'; end if;
  delete from public.play80_support_messages where user_id=p_user;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.play80_owner_threads(text), public.play80_owner_open_thread(uuid),
  public.play80_owner_delete_thread(uuid,uuid,bigint,text) from public, anon;
grant execute on function public.play80_owner_threads(text), public.play80_owner_open_thread(uuid),
  public.play80_owner_delete_thread(uuid,uuid,bigint,text) to authenticated;

CREATE OR REPLACE FUNCTION public.play80_menu_counts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  staff text := private.staff_role(auth.uid());
  wallet jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if staff in ('owner','admin') then
    select jsonb_build_object('requests',count(*),
      'deposit_count',count(*) filter(where request_kind='demo_credit'),
      'withdraw_count',count(*) filter(where request_kind='demo_debit'),
      'deposit_amount',coalesce(sum(amount) filter(where request_kind='demo_credit'),0),
      'withdraw_amount',coalesce(sum(amount) filter(where request_kind='demo_debit'),0))
    into wallet from public.demo_wallet_requests where status='pending';
  end if;
  return jsonb_build_object('requests',0,'support',case when staff='owner' then
    (select count(*) from private.play80_support_threads where needs_attention) else 0 end)||wallet;
end $function$
;
