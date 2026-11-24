-- PLAY80 V4.3 account safeguards; existing accounts and tournament data untouched.
create unique index if not exists play80_profiles_username_unique_lower on public.profiles (lower(username)) where username is not null;

create table if not exists public.play80_reserved_usernames (
 username text primary key,
 first_user_id uuid not null,
 reserved_at timestamptz not null default now()
);
alter table public.play80_reserved_usernames enable row level security;
revoke all on public.play80_reserved_usernames from anon, authenticated;

insert into public.play80_reserved_usernames(username,first_user_id)
select lower(username),id from public.profiles where username is not null
on conflict (username) do nothing;

create or replace function private.play80_username_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_name text;
begin
 if tg_op='UPDATE' and old.username is not null and new.username is distinct from old.username then
  raise exception 'Username is permanent and cannot be changed';
 end if;
 if new.username is null then return new; end if;
 v_name:=lower(btrim(new.username));
 if v_name !~ '^[a-z0-9_]{3,24}$' then raise exception 'Username requires 3-24 letters, digits or underscores'; end if;
 if tg_op='INSERT' or old.username is null then
  if exists(select 1 from public.play80_reserved_usernames where username=v_name and first_user_id<>new.id) then raise exception 'Username already reserved'; end if;
  insert into public.play80_reserved_usernames(username,first_user_id) values(v_name,new.id)
  on conflict (username) do nothing;
  if not exists(select 1 from public.play80_reserved_usernames where username=v_name and first_user_id=new.id) then raise exception 'Username already reserved'; end if;
 end if;
 new.username:=v_name;
 return new;
end $$;
drop trigger if exists play80_username_guard_trigger on public.profiles;
create trigger play80_username_guard_trigger before insert or update of username on public.profiles
for each row execute function private.play80_username_guard();

-- Signup supplies username in the Auth signup metadata. Auth trigger allocates it atomically.
create or replace function private.create_play80_user_data()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_username text:=lower(btrim(coalesce(new.raw_user_meta_data->>'username','')));
begin
 if v_username<>'' and v_username !~ '^[a-z0-9_]{3,24}$' then
  raise exception 'Invalid username';
 end if;
 insert into public.profiles(id,username,display_name)
 values(new.id,nullif(v_username,''),left(nullif(btrim(new.raw_user_meta_data->>'display_name'),''),80))
 on conflict(id) do nothing;
 insert into public.demo_wallets(user_id) values(new.id)
 on conflict(user_id) do nothing;
 return new;
end $$;

create table if not exists public.play80_support_messages (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 sender_id uuid not null references auth.users(id),
 sender_role text not null check(sender_role in ('player','owner')),
 body text not null check(char_length(body) between 1 and 1000),
 category text not null default 'general' check(category in ('general','account_deletion','coin_adjustment')),
 created_at timestamptz not null default now()
);
alter table public.play80_support_messages enable row level security;
revoke all on public.play80_support_messages from anon, authenticated;

-- User-initiated requests are messages, never automatic account deletion.
create or replace function public.play80_send_support_message(p_body text,p_category text default 'general')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_id uuid;
begin
 if v_uid is null then raise exception 'Login required'; end if;
 if coalesce(p_category,'') not in ('general','account_deletion') then raise exception 'Invalid category'; end if;
 if length(btrim(coalesce(p_body,''))) not between 1 and 1000 then raise exception 'Message length 1-1000'; end if;
 insert into public.play80_support_messages(user_id,sender_id,sender_role,body,category)
 values(v_uid,v_uid,'player',btrim(p_body),p_category) returning id into v_id;
 return jsonb_build_object('ok',true,'id',v_id);
end $$;
create or replace function public.play80_my_support_messages()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'category',m.category,'sender',m.sender_role,'at',m.created_at) order by m.created_at desc)
  from public.play80_support_messages m where m.user_id=auth.uid()),'[]'::jsonb);
end $$;

create or replace function public.play80_owner_support_messages(p_pin_token text,p_search text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.check_staff_pin_token(p_pin_token);
 if private.staff_role(auth.uid())<>'owner' then raise exception 'Owner access required'; end if;
 return coalesce((select jsonb_agg(row_to_json(t) order by t.created_at desc)
 from (select m.id,m.user_id,m.sender_role,m.category,m.body,m.created_at,p.username,u.email
 from public.play80_support_messages m
 join auth.users u on u.id=m.user_id left join public.profiles p on p.id=m.user_id
 where nullif(btrim(p_search),'') is null
 or u.id::text ilike '%'||btrim(p_search)||'%'
 or u.email ilike '%'||btrim(p_search)||'%'
 or p.username ilike '%'||btrim(p_search)||'%'
 order by m.created_at desc limit 100)t),'[]'::jsonb);
end $$;
create or replace function public.play80_owner_send_message(p_pin_token text,p_user uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.check_staff_pin_token(p_pin_token);
 if private.staff_role(auth.uid())<>'owner' then raise exception 'Owner access required'; end if;
 if length(btrim(coalesce(p_note,''))) not between 1 and 1000 then raise exception 'Enter a message 1-1000 characters'; end if;
 if not exists(select 1 from auth.users where id=p_user) then raise exception 'User does not exist'; end if;
 insert into public.play80_support_messages(user_id,sender_id,sender_role,body,category)
 values(p_user,auth.uid(),'owner',btrim(p_note),'general');
 insert into public.owner_audit_log(actor_id,action,object_type,object_id,details)
 values(auth.uid(),'owner_message','user',p_user,jsonb_build_object('note',left(p_note,1000)));
 return jsonb_build_object('ok',true);
end $$;

-- Owner coin reclaim does not mint or use client-side balance. It cannot spend reserved coins.
create or replace function public.play80_owner_reclaim_coins(p_pin_token text,p_target_user uuid,p_amount bigint,p_note text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_balance bigint;v_held bigint;
begin
 perform private.check_staff_pin_token(p_pin_token);
 if private.staff_role(auth.uid())<>'owner' then raise exception 'Owner access required'; end if;
 if p_target_user=auth.uid() then raise exception 'Cannot adjust Owner through this operation'; end if;
 if p_amount is null or p_amount<1 or p_amount>1000000 then raise exception 'Amount out of bounds'; end if;
 if length(btrim(coalesce(p_note,''))) not between 5 and 200 then raise exception 'Explain the correction (5-200 characters)'; end if;
 if p_operation_id is null then raise exception 'Operation ID required'; end if;
 perform 1 from public.demo_wallets where user_id=p_target_user for update;
 if not found then raise exception 'No wallet found'; end if;
 if exists(select 1 from public.owner_audit_log where action='reclaim_demo_coins' and details->>'operation_id'=p_operation_id::text) then
  return jsonb_build_object('ok',true,'duplicate',true);
 end if;
 update public.demo_wallets set balance=balance-p_amount,updated_at=now()
 where user_id=p_target_user and balance-held_balance>=p_amount
 returning balance,held_balance into v_balance,v_held;
 if not found then raise exception 'Insufficient available coins; reserved balance protected'; end if;
 insert into public.demo_wallet_ledger(user_id,delta,balance_after,reason)
 values(p_target_user,-p_amount,v_balance,'owner_correction');
 insert into public.owner_audit_log(actor_id,action,object_type,object_id,details)
 values(auth.uid(),'reclaim_demo_coins','user',p_target_user,jsonb_build_object('amount',p_amount,'note',btrim(p_note),'operation_id',p_operation_id));
 insert into public.play80_support_messages(user_id,sender_id,sender_role,body,category)
 values(p_target_user,auth.uid(),'owner','Coin correction: -'||p_amount||' Demo Coins. '||btrim(p_note),'coin_adjustment');
 return jsonb_build_object('ok',true,'duplicate',false,'balance_after',v_balance);
end $$;

-- Soft suspension is reversible and retains account identity (prevents reuse).
create or replace function public.play80_owner_account_control(p_pin_token text,p_target_user uuid,p_action text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user auth.users%rowtype;
begin
 perform private.check_staff_pin_token(p_pin_token);
 if private.staff_role(auth.uid())<>'owner' then raise exception 'Owner access required'; end if;
 if p_action not in ('suspend','restore') then raise exception 'Invalid action'; end if;
 if length(btrim(coalesce(p_note,''))) not between 5 and 200 then raise exception 'Reason required (5-200 chars)'; end if;
 select * into v_user from auth.users where id=p_target_user for update;
 if not found then raise exception 'Account not found'; end if;
 if p_target_user=auth.uid() or v_user.raw_app_meta_data->>'role' in ('owner','admin') then raise exception 'Owner/Admin accounts cannot be controlled here'; end if;
 update auth.users set banned_until=case when p_action='suspend' then now()+interval '100 years' else null end
 where id=p_target_user;
 insert into public.owner_audit_log(actor_id,action,object_type,object_id,details)
 values(auth.uid(),p_action||'_account','user',p_target_user,jsonb_build_object('reason',btrim(p_note)));
 insert into public.play80_support_messages(user_id,sender_id,sender_role,body,category)
 values(p_target_user,auth.uid(),'owner','Account '||p_action||': '||btrim(p_note),'general');
 return jsonb_build_object('ok',true,'action',p_action,'user_id',p_target_user);
end $$;

-- Only owner can transfer/reclaim. Existing staff grant RPC remains unchanged; UI restricts it to owner.
revoke all on function public.play80_send_support_message(text,text),public.play80_my_support_messages(),
 public.play80_owner_support_messages(text,text),public.play80_owner_send_message(text,uuid,text),
 public.play80_owner_reclaim_coins(text,uuid,bigint,text,uuid),
 public.play80_owner_account_control(text,uuid,text,text) from public,anon;
grant execute on function public.play80_send_support_message(text,text),public.play80_my_support_messages(),
 public.play80_owner_support_messages(text,text),public.play80_owner_send_message(text,uuid,text),
 public.play80_owner_reclaim_coins(text,uuid,bigint,text,uuid),
 public.play80_owner_account_control(text,uuid,text,text) to authenticated;