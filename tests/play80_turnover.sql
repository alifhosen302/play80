create schema auth;
create schema private;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create table public.demo_wallets(user_id uuid primary key,balance bigint not null default 0,updated_at timestamptz);
create table public.demo_wallet_requests(id uuid primary key default gen_random_uuid(),user_id uuid,request_kind text,amount bigint,status text);
create table public.bonus_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,request_id uuid,bonus_kind text,amount bigint,unique(user_id,bonus_kind));
create table public.wallet_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,transaction_type text,delta bigint,balance_after bigint,operation_key text unique,description text);
create table public.turnover_records(user_id uuid primary key,required bigint not null,completed bigint not null default 0,updated_at timestamptz);
create table private.play80_referral_awards(new_player uuid primary key,referrer uuid);
create table private.play80_daily_reward_clock(user_id uuid primary key,next_at timestamptz);
create function private.play80_demo_credit_bonus_trigger() returns trigger language plpgsql as $$ begin return new; end $$;
create function private.play80_turnover_on_entry() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger play80_first_bonus_on_approval after update of status on public.demo_wallet_requests
for each row execute function private.play80_demo_credit_bonus_trigger();
create trigger play80_turnover_entry after insert on public.wallet_transactions
for each row execute function private.play80_turnover_on_entry();
\i /tmp/play80-turnover.sql

do $$
declare player uuid:=gen_random_uuid();
declare other_player uuid:=gen_random_uuid();
declare due timestamptz:=now();
declare payload jsonb;
begin
  insert into auth.users values(player),(other_player);
  insert into public.demo_wallets(user_id,balance) values(player,2000),(other_player,200);
  insert into private.play80_daily_reward_clock values(player,due);
  insert into public.demo_wallet_requests(user_id,request_kind,amount,status)
  values(player,'demo_credit',1000,'pending'),(other_player,'demo_credit',100,'pending');
  update public.demo_wallet_requests set status='approved' where status='pending';
  insert into public.demo_wallet_requests(user_id,request_kind,amount,status) values(player,'demo_credit',500,'pending');
  update public.demo_wallet_requests set status='approved' where status='pending';
  update private.play80_daily_reward_clock set next_at=due+interval '48 hours' where user_id=player;
  insert into private.play80_referral_awards values(other_player,player);

  perform set_config('test.uid',player::text,true);
  insert into public.turnover_records(user_id,required,completed) values(player,40,10);
  payload:=public.play80_my_turnover();
  assert (payload#>>'{items,0,source}')='legacy' and (payload#>>'{items,0,completed}')::bigint=10,'Legacy progress must be visible';
  insert into public.wallet_transactions(user_id,transaction_type,delta,operation_key)
    values(player,'tournament_entry',-30,'legacy-entry');
  assert public.play80_my_turnover()=payload,'A tournament entry must preserve progress';
  insert into public.wallet_transactions(user_id,transaction_type,delta,operation_key)
    values(player,'tournament_reward',30,'legacy-win');
  payload:=public.play80_my_turnover();
  assert jsonb_array_length(payload->'items')=6,'Each deposit and bonus must have its own item';
  assert (payload->'items'->0->>'required')::bigint=1000,'Deposit requires exactly the deposited amount';
  assert (payload->'items'->1->>'required')::bigint=15000,'First-deposit bonus is 3x';
  assert (payload->'items'->2->>'required')::bigint=500,'Repeat deposit has its own requirement';
  assert (payload->'items'->3->>'required')::bigint=150 and (payload->'items'->4->>'required')::bigint=150,'Each daily bonus is 3x';
  assert (payload->'items'->5->>'required')::bigint=1500,'Referral bonus is 3x';
  assert (payload->>'withdrawal_guard_enabled')::boolean=false,'Staged migration must leave withdrawals available';
  insert into public.demo_wallet_requests(user_id,request_kind,amount,status) values(player,'demo_debit',200,'pending');
  update private.play80_turnover_settings set withdrawal_guard_enabled=true;
  begin
    insert into public.demo_wallet_requests(user_id,request_kind,amount,status) values(player,'demo_debit',200,'pending');
    raise exception using errcode='assert_failure',message='Open turnover did not stop a withdrawal';
  exception when raise_exception then
    if sqlerrm<>'PLAY80_TURNOVER_PENDING' then raise; end if;
  end;
  begin
    update public.demo_wallet_requests set status='approved' where user_id=player and request_kind='demo_debit';
    raise exception using errcode='assert_failure',message='Open turnover did not stop approval of a pending withdrawal';
  exception when raise_exception then
    if sqlerrm<>'PLAY80_TURNOVER_PENDING' then raise; end if;
  end;

  insert into public.wallet_transactions(user_id,transaction_type,delta,operation_key)
  values(player,'tournament_entry',-100,'entry'),(player,'first_demo_credit_bonus',5000,'bonus'),
        (player,'tournament_reward',50,'won-50');
  payload:=public.play80_my_turnover();
  assert (payload->'items'->0->>'completed')::bigint=50,'Only winnings should advance turnover';
  assert (payload->'items'->1->>'completed')::bigint=0,'A coin must count toward one item only';
  insert into public.wallet_transactions(user_id,transaction_type,delta,operation_key)
  values(player,'tournament_reward',1000,'won-1000');
  payload:=public.play80_my_turnover();
  assert jsonb_array_length(payload->'items')=5,'Completed item should disappear';
  assert (payload->'items'->0->>'completed')::bigint=50,'Excess should flow to the next item';
  perform set_config('test.uid',other_player::text,true);
  assert jsonb_array_length(public.play80_my_turnover()->'items')=1,'Only own rows must be visible';
  perform set_config('test.uid',player::text,true);
  insert into public.wallet_transactions(user_id,transaction_type,delta,operation_key)
  values(player,'tournament_reward',20000,'won-final');
  assert jsonb_array_length(public.play80_my_turnover()->'items')=0,'All turnover should finish';
  insert into public.demo_wallet_requests(user_id,request_kind,amount,status) values(player,'demo_debit',200,'pending');
end $$;
