-- Minimal throwaway schema for the production migration contract.
create role anon;
create role authenticated;
create schema auth;
create schema private;
create schema cron;
create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
create table auth.users (
  id uuid primary key, email_confirmed_at timestamptz, is_anonymous boolean not null default false,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, banned_until timestamptz, created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;
create function private.staff_role(uuid) returns text language sql as $$
  select coalesce(raw_app_meta_data->>'role','player') from auth.users where id=$1
$$;
create function private.play80_require_staff_read() returns void language plpgsql as $$
begin
  if coalesce(private.staff_role(auth.uid()),'') not in ('owner','admin') then raise exception 'Staff required'; end if;
end $$;
create function private.play80_check_login_pin(text) returns boolean language sql as $$ select $1='123456' $$;
create table public.profiles(id uuid primary key,username text);
create table public.demo_wallets(user_id uuid primary key,balance bigint default 0);
create table public.demo_wallet_ledger(user_id uuid,delta bigint,balance_after bigint,reason text check(reason='demo_adjustment'));
create table public.demo_wallet_requests(request_kind text,amount bigint,status text);
create table public.bonus_transactions(user_id uuid,bonus_kind text);
create table public.play80_support_messages(
  id uuid primary key default gen_random_uuid(), user_id uuid not null, sender_role text not null,
  body text not null, category text default 'general', created_at timestamptz default now(), owner_read_at timestamptz
);
create function private.create_player_fixture() returns trigger language plpgsql as $$
begin
  insert into public.profiles values(new.id,new.raw_user_meta_data->>'username');
  insert into public.demo_wallets(user_id) values(new.id);
  return new;
end $$;
create trigger on_user_created after insert on auth.users for each row execute function private.create_player_fixture();
insert into auth.users(id,email_confirmed_at,raw_user_meta_data,created_at) values
  ('00000000-0000-4000-8000-000000000001',now(),'{"username":"sponsor"}',now()-interval '1 day');
\i /tmp/play80-reward-migration.sql
do $$
declare sponsor uuid:='00000000-0000-4000-8000-000000000001';
declare player uuid:='00000000-0000-4000-8000-000000000002';
declare staff uuid:='00000000-0000-4000-8000-000000000003';
declare owner_id uuid:='00000000-0000-4000-8000-000000000004';
declare unknown_ref uuid:='00000000-0000-4000-8000-000000000005';
declare current_thread jsonb;
begin
  insert into auth.users(id,raw_user_meta_data) values(player,'{"username":"new_player","play80_referral":"sponsor"}');
  if (select balance from public.demo_wallets where user_id=sponsor)<>0 then raise exception 'Award before verification'; end if;
  update auth.users set email_confirmed_at=now() where id=player;
  update auth.users set email_confirmed_at=now() where id=player;
  insert into auth.users(id,email_confirmed_at,raw_user_meta_data) values(unknown_ref,now(),'{"username":"other_player","play80_referral":"missing"}');
  if (select balance from public.demo_wallets where user_id=sponsor)<>500 then raise exception 'Referral must award exactly once'; end if;
  if (select balance from public.demo_wallets where user_id=player)<>0 then raise exception 'New player must start at zero'; end if;
  perform set_config('test.user_id',sponsor::text,true);
  if public.play80_my_rewards()->>'referral_count' <> '1' then raise exception 'Reward count'; end if;
  insert into public.bonus_transactions values(sponsor,'first_exact_1000_demo_credit');
  if public.play80_my_rewards()->>'first_claimed' <> 'true' then raise exception 'First bonus status'; end if;
  update private.play80_daily_reward_clock set next_at=now()-interval '25 hours' where user_id=player;
  perform private.play80_award_daily_coins();
  perform private.play80_award_daily_coins();
  if (select balance from public.demo_wallets where user_id=player)<>100 then raise exception 'Two daily cycles must award 100 exactly once'; end if;
  if (select next_at from private.play80_daily_reward_clock where user_id=player)<>now()+interval '23 hours'
    then raise exception 'Daily reward drift'; end if;

  insert into auth.users(id,email_confirmed_at,raw_app_meta_data) values
    (staff,now(),'{"role":"admin"}'),(owner_id,now(),'{"role":"owner"}');
  insert into public.play80_support_messages(user_id,sender_role,body) values(player,'player','first');
  perform set_config('test.user_id',staff::text,true);
  begin
    perform public.play80_owner_threads();
    raise exception using errcode='assert_failure',message='Admin read player support';
  exception when raise_exception then
    if sqlerrm <> 'Owner access required' then raise; end if;
  end;
  perform set_config('test.user_id',owner_id::text,true);
  perform public.play80_owner_open_thread(player);
  if public.play80_menu_counts()->>'support' <> '1' then raise exception 'Read and unanswered must keep red dot'; end if;
  insert into public.play80_support_messages(user_id,sender_role,body) values(player,'owner','answered');
  if public.play80_menu_counts()->>'support' <> '0' then raise exception 'Read and answered must clear red dot'; end if;
  current_thread:=public.play80_owner_threads()->0;
  if public.play80_owner_delete_thread(player,(current_thread->>'latest_id')::uuid,2,'000000')->>'ok'<>'false'
    then raise exception 'Wrong PIN allowed deletion'; end if;
  insert into public.play80_support_messages(user_id,sender_role,body) values(player,'player','new message');
  begin
    perform public.play80_owner_delete_thread(player,(current_thread->>'latest_id')::uuid,2,'123456');
    raise exception using errcode='assert_failure',message='New message deleted with stale confirmation';
  exception when raise_exception then
    if sqlerrm <> 'Conversation changed or still needs a reply' then raise; end if;
  end;
  perform public.play80_owner_open_thread(player);
  insert into public.play80_support_messages(user_id,sender_role,body) values(player,'owner','resolved');
  current_thread:=public.play80_owner_threads()->0;
  perform public.play80_owner_delete_thread(player,(current_thread->>'latest_id')::uuid,4,'123456');
  if exists(select 1 from public.play80_support_messages where user_id=player) then raise exception 'Confirmed thread not removed'; end if;
end $$;
