-- Daily virtual rewards accrue into a claim queue; previously credited wallets stay unchanged.
-- A claim is bound to the oldest due period so replaying a request cannot double-credit.
alter table private.play80_daily_reward_clock
  add column pending_cycles bigint not null default 0 check (pending_cycles>=0);
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
  update private.play80_daily_reward_clock
  set next_at=due+cycles*interval '24 hours',pending_cycles=pending_cycles+cycles
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
    'pending_coins',coalesce(c.pending_cycles,0)*50,
    'claim_due_at',case when c.pending_cycles>0 then c.next_at-c.pending_cycles*interval '24 hours' end,
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
  select c.next_at-c.pending_cycles*interval '24 hours' into due
  from private.play80_daily_reward_clock c
  join auth.users u on u.id=c.user_id join public.demo_wallets w on w.user_id=c.user_id
  where c.user_id=player_id and c.pending_cycles>0 and u.email_confirmed_at is not null
    and not u.is_anonymous and (u.banned_until is null or u.banned_until<=now())
    and coalesce(u.raw_app_meta_data->>'role','player')='player'
  for update of c;
  if found and due=p_due_at then
    perform private.play80_credit_reward(player_id,50);
    perform private.play80_record_turnover(player_id,'daily_bonus',
      player_id::text||':'||extract(epoch from due)::text,50);
    update private.play80_daily_reward_clock set pending_cycles=pending_cycles-1 where user_id=player_id;
    credited:=50;
  end if;
  return jsonb_build_object('claimed',credited,'rewards',public.play80_my_rewards());
end;
$$;
revoke all on function public.play80_claim_daily_bonus(timestamptz) from public,anon;
grant execute on function public.play80_claim_daily_bonus(timestamptz) to authenticated;
