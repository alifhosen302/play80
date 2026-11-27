-- Demo-only credit requests: authenticated users can submit a request without
-- entering a second PIN. Withdrawal, staff approvals and other sensitive actions
-- retain their existing authorization. No real money or fee is involved.
create function public.play80_submit_demo_credit(p_amount bigint,p_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();
declare v_reference text:=btrim(coalesce(p_reference,''));
begin
  if v_uid is null or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=v_uid and u.email_confirmed_at is not null and not u.is_anonymous
    and (u.banned_until is null or u.banned_until<=now())
    and coalesce(u.raw_app_meta_data->>'role','player') in ('player','dsr')
    and nullif(btrim(p.username),'') is not null)
    then raise exception 'Verified player login required'; end if;
  if length(v_reference) not between 1 and 220 then raise exception 'Demo reference required'; end if;
  return jsonb_build_object('ok',true,'request_id',public.submit_demo_wallet_request('demo_credit',p_amount,'ডেমো ট্রান্সেকশন নম্বর: '||v_reference));
end $$;
revoke all on function public.play80_submit_demo_credit(bigint,text) from public,anon;
grant execute on function public.play80_submit_demo_credit(bigint,text) to authenticated;

-- Older referral awards were already credited: mark them claimed, not payable twice.
alter table private.play80_referral_awards add column claimed_at timestamptz default now();
alter table private.play80_referral_awards alter column claimed_at drop default;
alter table private.play80_referral_awards disable trigger play80_turnover_on_referral;
create or replace function private.play80_register_player_rewards()
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
    -- Credit only when the sponsor claims this award.
  end if;
  return new;
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
    'pending_referrals',coalesce((select jsonb_agg(a.new_player order by a.awarded_at,a.new_player) from private.play80_referral_awards a where a.referrer=u.id and a.claimed_at is null),'[]'::jsonb),
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

create function public.play80_claim_referral_bonus(p_new_player uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();
declare v_claim uuid;
declare credited bigint:=0;
begin
  if v_uid is null then raise exception 'Login required'; end if;
  update private.play80_referral_awards a set claimed_at=clock_timestamp()
  where a.new_player=p_new_player and a.referrer=v_uid and a.claimed_at is null
    and exists(select 1 from auth.users u join public.demo_wallets w on w.user_id=u.id
    where u.id=v_uid and u.email_confirmed_at is not null and not u.is_anonymous
      and (u.banned_until is null or u.banned_until<=now())
      and coalesce(u.raw_app_meta_data->>'role','player')='player')
  returning a.new_player into v_claim;
  if found then
    perform private.play80_credit_reward(v_uid,500);
    perform private.play80_record_turnover(v_uid,'referral_bonus',v_claim::text,500);
    credited:=500;
  end if;
  return jsonb_build_object('claimed',credited,'rewards',public.play80_my_rewards());
end $$;
revoke all on function public.play80_claim_referral_bonus(uuid) from public,anon;
grant execute on function public.play80_claim_referral_bonus(uuid) to authenticated;
