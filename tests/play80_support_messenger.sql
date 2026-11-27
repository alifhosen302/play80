-- Isolated test; no live customer rows.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create schema auth;
create schema private;
create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean default false,banned_until timestamptz,raw_app_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create table public.play80_support_messages(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),sender_id uuid references auth.users(id),sender_role text check(sender_role in ('player','owner')),body text,category text,created_at timestamptz default now(),owner_read_at timestamptz);
create view private.play80_support_threads as select user_id,id as latest_id,body as preview,created_at as at,true as needs_attention,1::bigint as message_count from public.play80_support_messages;
create function private.play80_require_staff_read() returns void language plpgsql as $$ begin if not exists(select 1 from auth.users where id=auth.uid() and raw_app_meta_data->>'role'='owner') then raise exception 'staff only'; end if; end $$;
\i /work/supabase/migrations/20261127193000_support_messenger.sql
do $$
declare a uuid:=gen_random_uuid();
declare b uuid:=gen_random_uuid();
declare owner_id uuid:=gen_random_uuid();
declare denied boolean:=false;
begin
  insert into auth.users(id,email_confirmed_at,raw_app_meta_data) values(a,now(),'{}'),(b,now(),'{}'),(owner_id,now(),'{"role":"owner"}');
  perform set_config('test.uid',a::text,true);
  perform public.play80_send_support_message('হ্যালো','general');
  assert (public.play80_my_support_messages()->0->>'automatic_step')='choose';
  perform public.play80_send_support_message('ডিপোজিট সমস্যা','general');
  assert (public.play80_my_support_messages()->0->>'automatic_step')='deposit';
  perform public.play80_send_support_message('ডেমো ৫০০ কয়েন, দুপুর ১২টা','general');
  assert (public.play80_my_support_messages()->0->>'automatic_step')='received';
  assert jsonb_array_length(public.play80_my_support_messages())=6;
  assert (select needs_attention from private.play80_support_threads where user_id=a);
  perform set_config('test.uid',b::text,true);
  assert jsonb_array_length(public.play80_my_support_messages())=0;
  perform public.play80_send_support_message('hi','general');
  perform public.play80_send_support_message('উইথড্র সমস্যা','general');
  assert (public.play80_my_support_messages()->0->>'automatic_step')='withdraw';
  begin perform public.play80_owner_open_thread(a); exception when others then denied:=true; end;
  assert denied,'Player cannot open another thread';
  perform set_config('test.uid',owner_id::text,true);
  assert jsonb_array_length(public.play80_owner_open_thread(a))=6;
  assert (select needs_attention from private.play80_support_threads where user_id=a),'Auto reply does not resolve ticket';
  insert into public.play80_support_messages(user_id,sender_id,sender_role,body,category,created_at) values(a,owner_id,'owner','Manual reply','general',clock_timestamp());
  assert not (select needs_attention from private.play80_support_threads where user_id=a),'Human response resolves attention';
  assert not has_function_privilege('anon','public.play80_send_support_message(text,text)','execute');
end $$;
