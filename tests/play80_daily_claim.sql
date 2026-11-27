do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create schema cron;
create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
create schema auth;
create schema private;
create table auth.users (
  id uuid primary key, email_confirmed_at timestamptz, is_anonymous boolean not null default false,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, banned_until timestamptz, created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create table public.demo_wallets(user_id uuid primary key,balance bigint not null default 0,held_balance bigint not null default 0,updated_at timestamptz);
create table public.demo_wallet_requests(id uuid primary key default gen_random_uuid(),user_id uuid,request_kind text,amount bigint,status text,reviewed_at timestamptz);
create table public.bonus_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,request_id uuid,bonus_kind text,amount bigint,unique(user_id,bonus_kind));
create table public.wallet_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,transaction_type text,delta bigint,balance_after bigint,operation_key text unique,description text);
create table public.turnover_records(user_id uuid primary key,required bigint not null,completed bigint not null default 0,updated_at timestamptz);
create table public.profiles(id uuid primary key,username text);
create table public.owner_audit_log(action text,object_id uuid,details jsonb,created_at timestamptz default now());
create table private.play80_owner_transfers (
  operation_id uuid primary key,owner_id uuid not null,player_id uuid not null,
  direction text not null,amount bigint not null,source_after bigint,destination_after bigint
);
create table private.staff_coin_transfer_keys(
  operation_id uuid primary key,actor_id uuid not null,target_user_id uuid not null,amount bigint not null
);
create table public.demo_wallet_ledger(user_id uuid,delta bigint,balance_after bigint,reason text check(reason='demo_adjustment'));
create table public.play80_support_messages(
  id uuid primary key default gen_random_uuid(),user_id uuid not null,sender_role text not null,
  body text not null,category text default 'general',created_at timestamptz default now(),owner_read_at timestamptz
);
create function private.staff_role(uuid) returns text language sql as $$ select coalesce(raw_app_meta_data->>'role','player') from auth.users where id=$1 $$;
create function private.play80_require_staff_read() returns void language plpgsql as $$ begin return; end $$;
create function private.play80_check_login_pin(text) returns boolean language sql as $$ select false $$;
create function private.create_player_fixture() returns trigger language plpgsql as $$
begin
  insert into public.profiles values(new.id,new.id::text);
  insert into public.demo_wallets(user_id) values(new.id);
  return new;
end $$;
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

-- Check the revised combined first-deposit rule separately from daily claims.
do $$
declare player uuid:='00000000-0000-4000-8000-000000000004';
declare ordinary uuid:='00000000-0000-4000-8000-000000000005';
declare payload jsonb;
begin
  insert into auth.users(id,email_confirmed_at) values(player,now()),(ordinary,now());
  insert into public.demo_wallet_requests(user_id,request_kind,amount,status)
    values(player,'demo_credit',1000,'pending'),(ordinary,'demo_credit',500,'pending');
  update public.demo_wallet_requests set status='approved' where status='pending' and user_id in (player,ordinary);
  insert into public.demo_wallet_requests(user_id,request_kind,amount,status)
    values(player,'demo_credit',500,'pending');
  update public.demo_wallet_requests set status='approved' where status='pending' and user_id=player;
  perform set_config('test.uid',player::text,true);
  payload:=public.play80_my_turnover();
  assert jsonb_array_length(payload->'items')=2,'First deposit and bonus form one item; repeat deposit is separate';
  assert (select count(*) from private.play80_turnover_items
    where user_id=player and source='first_deposit_bonus' and coins=6000 and required=18000 and completed=0)=1,
    'First deposit plus linked bonus must be 18000';
  assert (select count(*) from private.play80_turnover_items
    where user_id=player and source='deposit' and coins=500 and required=500 and completed=0)=1,
    'Repeat 500 deposit must remain 500';
  assert (select sum(required-completed) from private.play80_turnover_items where user_id=player)=18500,
    'Combined requirements must total 18500';
  assert (select sum(required-completed) from private.play80_turnover_items where user_id=ordinary)=500,
    'A deposit without a linked bonus remains 1x';
end $$;

do $$
declare player uuid:='00000000-0000-4000-8000-000000000004';
declare actor uuid:=gen_random_uuid();
declare op uuid:=gen_random_uuid();
declare receive_op uuid:=gen_random_uuid();
begin
  insert into private.play80_owner_transfers(operation_id,owner_id,player_id,direction,amount)
    values(op,actor,player,'send',500);
  assert not exists(select 1 from private.play80_turnover_items where source_key='owner_transfer:'||op::text),
    'Unfinished transfer cannot create turnover';
  update private.play80_owner_transfers set source_after=5000,destination_after=6500 where operation_id=op;
  update private.play80_owner_transfers set destination_after=6500 where operation_id=op;
  assert (select count(*) from private.play80_turnover_items where source_key='owner_transfer:'||op::text and required=500)=1,
    'Owner send creates exactly one 500 requirement';
  insert into private.play80_owner_transfers(operation_id,owner_id,player_id,direction,amount)
    values(receive_op,actor,player,'receive',100);
  update private.play80_owner_transfers set source_after=6400,destination_after=5100 where operation_id=receive_op;
  assert not exists(select 1 from private.play80_turnover_items where source_key='owner_transfer:'||receive_op::text),
    'Owner receiving coins is not a deposit';
  insert into private.staff_coin_transfer_keys values(gen_random_uuid(),actor,player,200);
  assert (select count(*) from private.play80_turnover_items where user_id=player and source_key like 'owner_grant:%' and required=200)=1,
    'Legacy owner send also counts at 1x';
end $$;

do $$
declare player uuid:='00000000-0000-4000-8000-000000000004';
declare recent_key text;
begin
  select source_key into recent_key from private.play80_turnover_items
    where user_id=player and source_key like 'owner_grant:%' limit 1;
  update private.play80_turnover_items set created_at=clock_timestamp()+interval '1 second'
    where source_key=recent_key;
  insert into public.wallet_transactions(user_id,transaction_type,delta,operation_key)
    values(player,'tournament_reward',50,'daily-test-newest-wins-first');
  assert (select completed from private.play80_turnover_items where source_key=recent_key)=50,
    'Latest item receives verified win first';
  assert not exists(select 1 from private.play80_turnover_items where user_id=player and source_key<>recent_key and completed>0),
    'Older items must remain unchanged while latest is incomplete';
end $$;

-- A completed recent 500-coin source releases only its principal while an
-- older 18,000-turnover source is pending. A hold and approval spend once.
do $$
declare player uuid:='00000000-0000-4000-8000-000000000006';
declare req uuid;
declare rejected boolean:=false;
begin
  insert into auth.users(id,email_confirmed_at) values(player,now());
  update public.demo_wallets set balance=6500 where user_id=player;
  perform private.play80_record_turnover(player,'first_deposit_bonus','fixture-old',6000);
  perform private.play80_record_turnover(player,'deposit','fixture-new',500);
  update private.play80_turnover_items set created_at=clock_timestamp()+interval '1 second' where source_key='fixture-new';
  perform set_config('test.uid',player::text,true);
  assert private.play80_withdrawable_coins(player)=0,'No completed source releases no coins';
  update public.demo_wallets set balance=7000 where user_id=player;
  insert into public.wallet_transactions(user_id,transaction_type,delta,operation_key)
    values(player,'tournament_reward',500,'fixture-win');
  assert private.play80_withdrawable_coins(player)=500,'Only completed latest principal releases';
  assert jsonb_array_length(public.play80_my_turnover()->'items')=1,'Completed source disappears';
  update private.play80_turnover_settings set withdrawal_guard_enabled=true where singleton;
  begin
    insert into public.demo_wallet_requests(user_id,request_kind,amount,status)
      values(player,'demo_debit',501,'pending');
  exception when others then
    if sqlerrm='PLAY80_TURNOVER_PENDING' then rejected:=true; else raise; end if;
  end;
  assert rejected,'Excess simulated withdrawal is rejected';
  insert into public.demo_wallet_requests(user_id,request_kind,amount,status)
    values(player,'demo_debit',500,'pending') returning id into req;
  update public.demo_wallets set held_balance=500 where user_id=player;
  assert private.play80_withdrawable_coins(player)=0,'Pending hold reserves allowance';
  update public.demo_wallets set balance=6500,held_balance=0 where user_id=player;
  update public.demo_wallet_requests set status='approved' where id=req;
  assert private.play80_withdrawable_coins(player)=0,'Approved debit consumes allowance once';
  update public.demo_wallets set balance=0 where user_id=player;
  assert jsonb_array_length(public.play80_my_turnover()->'items')=0,'Zero balance closes old turnover';
  assert (select count(*) from private.play80_turnover_items where user_id=player and voided_at is not null)=2,'Audit records remain';
  update public.demo_wallets set balance=500 where user_id=player;
  perform private.play80_record_turnover(player,'deposit','fixture-redeposit',500);
  assert jsonb_array_length(public.play80_my_turnover()->'items')=1,'Only new deposit survives zero reset';
  assert private.play80_withdrawable_coins(player)=0,'Old allowance cannot be reused';
  update private.play80_turnover_settings set withdrawal_guard_enabled=false where singleton;
end $$;
