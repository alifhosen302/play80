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
