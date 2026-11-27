create role anon;
create role authenticated;
create schema cron;
create function cron.schedule(text,text,text) returns bigint language sql as $ select 1::bigint $;
create schema auth;
create schema private;
create table auth.users (
  id uuid primary key, email_confirmed_at timestamptz, is_anonymous boolean not null default false,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, banned_until timestamptz, created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create table public.demo_wallets(user_id uuid primary key,balance bigint not null default 0,updated_at timestamptz);
create table public.demo_wallet_requests(id uuid primary key default gen_random_uuid(),user_id uuid,request_kind text,amount bigint,status text);
create table public.bonus_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,request_id uuid,bonus_kind text,amount bigint,unique(user_id,bonus_kind));
create table public.wallet_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,transaction_type text,delta bigint,balance_after bigint,operation_key text unique,description text);
create table public.turnover_records(user_id uuid primary key,required bigint not null,completed bigint not null default 0,updated_at timestamptz);
create table public.profiles(id uuid primary key,username text);
create table public.demo_wallet_ledger(user_id uuid,delta bigint,balance_after bigint,reason text check(reason='demo_adjustment'));
create table public.play80_support_messages(
  id uuid primary key default gen_random_uuid(),user_id uuid not null,sender_role text not null,
  body text not null,category text default 'general',created_at timestamptz default now(),owner_read_at timestamptz
);
create function private.staff_role(uuid) returns text language sql as $ select coalesce(raw_app_meta_data->>'role','player') from auth.users where id=$1 $;
create function private.play80_require_staff_read() returns void language plpgsql as $ begin return; end $;
create function private.play80_check_login_pin(text) returns boolean language sql as $ select false $;
create function private.create_player_fixture() returns trigger language plpgsql as $
begin
  insert into public.profiles values(new.id,new.id::text);
  insert into public.demo_wallets(user_id) values(new.id);
  return new;
end $;
create trigger on_user_created after insert on auth.users for each row execute function private.create_player_fixture();
create function private.play80_demo_credit_bonus_trigger() returns trigger language plpgsql as $$ begin return new; end $$;
create function private.play80_turnover_on_entry() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger play80_first_bonus_on_approval after update of status on public.demo_wallet_requests
for each row execute function private.play80_demo_credit_bonus_trigger();
create trigger play80_turnover_entry after insert on public.wallet_transactions
for each row execute function private.play80_turnover_on_entry();
\i /work/supabase/migrations/20261126193000_rewards_referrals_owner_support.sql
\i /work/supabase/migrations/20261126222000_stage_coin_turnover.sql
insert into auth.users(id,email_confirmed_at) values('00000000-0000-4000-8000-000000000001',now());
update private.play80_daily_reward_clock set next_at=now()-interval '1 hour' where user_id='00000000-0000-4000-8000-000000000001';
select private.play80_award_daily_coins();
\i /work/supabase/migrations/20261127090000_daily_bonus_claim_queue.sql
do $$
declare old_player uuid:='00000000-0000-4000-8000-000000000001';
declare player uuid:='00000000-0000-4000-8000-000000000002';
declare staff uuid:='00000000-0000-4000-8000-000000000003';
declare due timestamptz;
declare payload jsonb;
begin
  assert (select balance from public.demo_wallets where user_id=old_player)=50,'Previously credited bonus must remain';
  assert (select count(*) from private.play80_turnover_items where user_id=old_player)=1,'Existing turnover must remain';
  assert not exists(select 1 from private.play80_daily_bonus_claims where user_id=old_player),'Old bonus must not be claimable again';
  insert into auth.users(id,email_confirmed_at) values(player,now());
  perform set_config('test.uid',player::text,true);
  assert jsonb_array_length(public.play80_my_rewards()->'pending_periods')=0,'No initial bonus';
  assert (public.play80_claim_daily_bonus(now())->>'claimed')::bigint=0,'Cannot claim early';
  update private.play80_daily_reward_clock set next_at=now()-interval '25 hours' where user_id=player;
  perform private.play80_award_daily_coins();
  perform private.play80_award_daily_coins();
  payload:=public.play80_my_rewards();
  assert jsonb_array_length(payload->'pending_periods')=2,'Two completed periods accumulate';
  assert (payload->>'next_at')::timestamptz=now()+interval '23 hours','Timer must restart independent of claim';
  assert (select balance from public.demo_wallets where user_id=player)=0,'No automatic wallet credit';
  assert not exists(select 1 from private.play80_turnover_items where user_id=player),'No turnover before claim';
  due:=(payload->'pending_periods'->>0)::timestamptz;
  assert (public.play80_claim_daily_bonus(due+interval '48 hours')->>'claimed')::bigint=0,'Cannot claim future queue item';
  assert (public.play80_claim_daily_bonus(due+interval '24 hours')->>'claimed')::bigint=50,'Second period can be claimed first';
  assert (public.play80_claim_daily_bonus(due+interval '24 hours')->>'claimed')::bigint=0,'Replay must be idempotent';
  assert jsonb_array_length(public.play80_my_rewards()->'pending_periods')=1,'One pending bonus remains';
  assert (public.play80_my_rewards()->'pending_periods'->>0)::timestamptz=due,'Unselected earlier period remains';
  assert (public.play80_claim_daily_bonus(due)->>'claimed')::bigint=50,'Earlier period can still be claimed';
  assert (select balance from public.demo_wallets where user_id=player)=100,'Two valid claims credit exactly 100';
  assert (select count(*) from public.demo_wallet_ledger where user_id=player)=2,'Audit entries match claims';
  assert (select count(*) from private.play80_turnover_items where user_id=player and source='daily_bonus')=2,'Turnover recorded per claim';
  assert jsonb_array_length(public.play80_my_rewards()->'pending_periods')=0,'Queue empties only after claims';
  assert (public.play80_my_rewards()->>'next_at')::timestamptz=now()+interval '23 hours','Claim must not reset timer';
  insert into auth.users(id,email_confirmed_at,raw_app_meta_data) values(staff,now(),'{"role":"admin"}');
  perform set_config('test.uid',staff::text,true);
  assert (public.play80_claim_daily_bonus(due)->>'claimed')::bigint=0,'Staff cannot claim';
  assert not has_function_privilege('anon','public.play80_claim_daily_bonus(timestamptz)','execute'),'Anonymous role has no claim access';
end $$;
