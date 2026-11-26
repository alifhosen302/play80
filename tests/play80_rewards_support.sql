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

-- Navigation and replies use the verified session. Reviewing a request still uses the action PIN.
create schema extensions;
create extension pgcrypto with schema extensions;
alter table auth.users add column email text;
alter table public.demo_wallets add column held_balance bigint not null default 0;
alter table public.demo_wallet_requests
  add column id uuid primary key default gen_random_uuid(), add column user_id uuid,
  add column user_note text, add column review_note text,
  add column created_at timestamptz default now(), add column reviewed_at timestamptz;
alter table public.play80_support_messages add column sender_id uuid;
create table public.owner_audit_log(actor_id uuid, action text, object_type text, object_id uuid, details jsonb);
create table private.staff_pin_sessions(token_hash text, user_id uuid, expires_at timestamptz, login_scope text);
create function private.check_staff_pin_token(p_token text) returns void language plpgsql as $$
begin
  if not exists(select 1 from private.staff_pin_sessions
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
      and user_id=auth.uid() and expires_at>now()) then raise exception 'PIN token required'; end if;
end $$;
create function public.staff_review_demo_request(p_token text,p_id uuid,p_decision text,p_note text)
returns jsonb language plpgsql as $$
begin
  perform private.check_staff_pin_token(p_token);
  update public.demo_wallet_requests set status=p_decision,review_note=p_note where id=p_id and status='pending';
  if not found then raise exception 'No pending request'; end if;
  return jsonb_build_object('ok',true);
end $$;
\i /tmp/play80-navigation-migration.sql
do $$
declare player uuid:='00000000-0000-4000-8000-000000000002';
declare admin_id uuid:='00000000-0000-4000-8000-000000000003';
declare owner_id uuid:='00000000-0000-4000-8000-000000000004';
declare request_id uuid;
declare review jsonb;
begin
  insert into public.demo_wallet_requests(user_id,request_kind,amount,status)
    values(player,'demo_credit',100,'pending') returning id into request_id;
  insert into public.play80_support_messages(user_id,sender_id,sender_role,body)
    values(player,player,'player','New question');
  review:=jsonb_build_object('p_request_id',request_id,'p_decision','approved');

  perform set_config('test.user_id',player::text,true);
  begin
    perform public.play80_owner_wallet_page(null,'all','pending');
    raise exception using errcode='assert_failure',message='Player could read wallet requests';
  exception when raise_exception then
    if sqlerrm <> 'Staff required' then raise; end if;
  end;
  perform set_config('test.user_id',admin_id::text,true);
  if (public.play80_owner_wallet_page(null,'demo_credit','pending')->'rows'->0->>'id') is distinct from request_id::text
    then raise exception 'Admin could not open wallet requests'; end if;
  begin
    perform public.play80_owner_reply_support(player,'Admin reply');
    raise exception using errcode='assert_failure',message='Admin sent an Owner reply';
  exception when insufficient_privilege then null;
  end;
  perform set_config('test.user_id',owner_id::text,true);
  if (public.play80_owner_wallet_page(null,'all','pending')->'rows'->0->>'id') is distinct from request_id::text
    then raise exception 'Owner could not open wallet requests'; end if;
  if public.play80_confirm_staff_action(null,'000000','staff_review_demo_request',review)->>'ok' <> 'false'
    then raise exception 'Wrong PIN accepted for review'; end if;
  if public.play80_confirm_staff_action(null,'123456','staff_review_demo_request',review)->>'ok' <> 'true'
    then raise exception 'Review with action PIN failed'; end if;
  if (select status from public.demo_wallet_requests where id=request_id) <> 'approved'
    or exists(select 1 from private.staff_pin_sessions where user_id=owner_id)
    then raise exception 'Request review or action token cleanup failed'; end if;

  perform public.play80_owner_open_thread(player);
  perform public.play80_owner_reply_support(player,' Owner reply ');
  if not exists (select 1 from public.play80_support_messages
      where user_id=player and sender_id=owner_id and sender_role='owner' and body='Owner reply')
    or public.play80_menu_counts()->>'support' <> '0'
    or not exists(select 1 from public.owner_audit_log where actor_id=owner_id and object_id=player)
    then raise exception 'Owner reply, notification or audit failed'; end if;
end $$;
