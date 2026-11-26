create table private.play80_login_pin_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failures integer not null default 0,
  locked_until timestamptz
);
alter table private.play80_login_pin_attempts enable row level security;
revoke all on private.play80_login_pin_attempts from public, anon, authenticated;

create function private.play80_check_login_pin(p_pin text)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  uid uuid := auth.uid();
  saved_hash text;
  attempts private.play80_login_pin_attempts%rowtype;
begin
  if uid is null or p_pin is null or p_pin !~ '^[0-9]{6}$' then return false; end if;
  select encrypted_password into saved_hash from auth.users
  where id=uid and email_confirmed_at is not null and (banned_until is null or banned_until<=now());
  if saved_hash is null or saved_hash !~ '^\$2[aby]\$' then return false; end if;
  insert into private.play80_login_pin_attempts(user_id) values(uid) on conflict do nothing;
  select * into attempts from private.play80_login_pin_attempts where user_id=uid for update;
  if attempts.locked_until>now() then return false; end if;
  if extensions.crypt(p_pin,saved_hash) is distinct from saved_hash then
    update private.play80_login_pin_attempts
    set failures=case when attempts.failures>=4 then 0 else attempts.failures+1 end,
      locked_until=case when attempts.failures>=4 then now()+interval '15 minutes' else null end
    where user_id=uid;
    return false;
  end if;
  update private.play80_login_pin_attempts set failures=0,locked_until=null where user_id=uid;
  return true;
end $$;
revoke all on function private.play80_check_login_pin(text) from public, anon, authenticated;

alter table private.staff_pin_sessions add column login_scope text;

create function public.play80_open_owner_panel(p_pin text, p_scope text default 'panel')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_token text;
begin
  if coalesce(private.staff_role(auth.uid()),'') not in ('owner','admin') or coalesce(p_scope,'') not in ('panel','dsr') then
    raise exception 'Verified staff login required';
  end if;
  if p_scope='dsr' and private.staff_role(auth.uid())<>'owner' then raise exception 'Owner login required'; end if;
  if not private.play80_check_login_pin(p_pin) then return jsonb_build_object('ok',false); end if;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  delete from private.staff_pin_sessions where user_id=auth.uid() and (expires_at<=now() or login_scope=p_scope);
  insert into private.staff_pin_sessions(token_hash,user_id,expires_at,login_scope)
  values(encode(extensions.digest(v_token,'sha256'),'hex'),auth.uid(),now()+interval '3 minutes',p_scope);
  return jsonb_build_object('ok',true,'token',v_token,'expires_in',180);
end $$;

create function public.play80_confirm_staff_action(p_panel_token text,p_pin text,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.check_staff_pin_token(p_panel_token);
  if not exists(select 1 from private.staff_pin_sessions
    where user_id=auth.uid() and token_hash=encode(extensions.digest(p_panel_token,'sha256'),'hex')
    and login_scope='panel' and expires_at>now()) then raise exception 'Login PIN required to open the panel'; end if;
  if not private.play80_check_login_pin(p_pin) then return jsonb_build_object('ok',false); end if;
  case p_action
    when 'staff_review_demo_request' then return jsonb_build_object('ok',true,'result',public.staff_review_demo_request(p_panel_token,(p_payload->>'p_request_id')::uuid,(p_payload->>'p_decision')::text,(p_payload->>'p_review_note')::text));
    when 'staff_send_demo_coins' then return jsonb_build_object('ok',true,'result',public.staff_send_demo_coins(p_panel_token,(p_payload->>'p_target_user')::uuid,(p_payload->>'p_amount')::bigint,(p_payload->>'p_operation_id')::uuid,(p_payload->>'p_note')::text));
    when 'staff_manage_admin' then return jsonb_build_object('ok',true,'result',public.staff_manage_admin(p_panel_token,(p_payload->>'p_target_user')::uuid,(p_payload->>'p_action')::text));
    when 'play80_owner_bot_upsert' then return jsonb_build_object('ok',true,'result',public.play80_owner_bot_upsert(p_panel_token,(p_payload->>'p_bot_id')::uuid,(p_payload->>'p_username')::text,(p_payload->>'p_avatar')::text,(p_payload->>'p_skill')::text,(p_payload->>'p_active')::boolean));
    when 'play80_owner_send_message' then return jsonb_build_object('ok',true,'result',public.play80_owner_send_message(p_panel_token,(p_payload->>'p_user')::uuid,(p_payload->>'p_note')::text));
    when 'play80_owner_reclaim_coins' then return jsonb_build_object('ok',true,'result',public.play80_owner_reclaim_coins(p_panel_token,(p_payload->>'p_target_user')::uuid,(p_payload->>'p_amount')::bigint,(p_payload->>'p_note')::text,(p_payload->>'p_operation_id')::uuid));
    when 'play80_owner_account_control' then return jsonb_build_object('ok',true,'result',public.play80_owner_account_control(p_panel_token,(p_payload->>'p_target_user')::uuid,(p_payload->>'p_action')::text,(p_payload->>'p_note')::text));
    else raise exception 'Unsupported staff action';
  end case;
end $$;

create function public.play80_confirm_wallet_request(p_pin text,p_kind text,p_amount bigint,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if not private.play80_check_login_pin(p_pin) then return jsonb_build_object('ok',false); end if;
  return jsonb_build_object('ok',true,'request_id',public.submit_demo_wallet_request(p_kind,p_amount,p_note));
end $$;

revoke all on function public.play80_open_owner_panel(text,text), public.play80_confirm_staff_action(text,text,text,jsonb), public.play80_confirm_wallet_request(text,text,bigint,text) from public, anon;
grant execute on function public.play80_open_owner_panel(text,text), public.play80_confirm_staff_action(text,text,text,jsonb), public.play80_confirm_wallet_request(text,text,bigint,text) to authenticated;

create function public.play80_request_account_review(p_pin text,p_body text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.play80_check_login_pin(p_pin) then return jsonb_build_object('ok',false); end if;
  return public.play80_send_support_message(p_body,'account_deletion');
end $$;

create function public.play80_confirm_username(p_pin text,p_username text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.play80_check_login_pin(p_pin) then return jsonb_build_object('ok',false); end if;
  if p_username is null or p_username !~ '^[a-z0-9_]{3,24}$' then raise exception 'Invalid username'; end if;
  update public.profiles set username=p_username where id=auth.uid() and username is null;
  if not found then raise exception 'Username already set or profile missing'; end if;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.play80_request_account_review(text,text), public.play80_confirm_username(text,text) from public, anon;
grant execute on function public.play80_request_account_review(text,text), public.play80_confirm_username(text,text) to authenticated;

create or replace function public.play80_menu_counts()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  staff text := private.staff_role(auth.uid());
  wallet jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if staff in ('owner','admin') then
    select jsonb_build_object('requests',count(*),
      'deposit_count',count(*) filter(where request_kind='demo_credit'),
      'withdraw_count',count(*) filter(where request_kind='demo_debit'),
      'deposit_amount',coalesce(sum(amount) filter(where request_kind='demo_credit'),0),
      'withdraw_amount',coalesce(sum(amount) filter(where request_kind='demo_debit'),0))
    into wallet from public.demo_wallet_requests where status='pending';
  end if;
  return jsonb_build_object('requests',0,'support',case when staff='owner' then
    (select count(*) from public.play80_support_messages where sender_role='player' and owner_read_at is null) else 0 end)||wallet;
end $$;
