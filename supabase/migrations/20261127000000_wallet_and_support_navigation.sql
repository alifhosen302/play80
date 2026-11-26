-- Verified staff can browse requests using their session. Request review still checks the login PIN.
create or replace function public.play80_owner_wallet_page(p_pin_token text,p_kind text,p_view text,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rows jsonb; summary jsonb; available bigint;
begin
  perform private.play80_require_staff_read();
  if p_pin_token is not null then
    perform private.check_staff_pin_token(p_pin_token);
  end if;
  if p_kind is null or p_kind not in ('all','demo_credit','demo_debit') or p_view is null or p_view not in ('pending','history') then
    raise exception 'Invalid wallet filter';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb) into rows
  from (
    select r.id,r.user_id,r.request_kind,r.amount,r.status,r.user_note,r.review_note,r.created_at,r.reviewed_at,
      u.email,p.username
    from public.demo_wallet_requests r
    join auth.users u on u.id=r.user_id
    left join public.profiles p on p.id=r.user_id
    where (p_kind='all' or r.request_kind=p_kind) and
      ((p_view='pending' and r.status='pending') or (p_view='history' and r.status in ('approved','rejected')))
    order by r.created_at desc,r.id desc
    limit 31 offset greatest(coalesce(p_offset,0),0)
  ) x;
  select jsonb_build_object(
    'deposit_count',count(*) filter(where request_kind='demo_credit'),
    'withdraw_count',count(*) filter(where request_kind='demo_debit'),
    'deposit_amount',coalesce(sum(amount) filter(where request_kind='demo_credit'),0),
    'withdraw_amount',coalesce(sum(amount) filter(where request_kind='demo_debit'),0))
  into summary from public.demo_wallet_requests where status='pending';
  if private.staff_role(auth.uid())='owner' then
    select balance-held_balance into available from public.demo_wallets where user_id=auth.uid();
  end if;
  return jsonb_build_object('rows',rows,'summary',summary,'owner_available',available);
end $$;
revoke all on function public.play80_owner_wallet_page(text,text,text,integer) from public, anon;
grant execute on function public.play80_owner_wallet_page(text,text,text,integer) to authenticated;

CREATE OR REPLACE FUNCTION public.play80_confirm_staff_action(p_panel_token text, p_pin text, p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  use_panel_token boolean := p_action is not distinct from 'staff_review_demo_request' and p_panel_token is not null;
  v_token text;
  v_result jsonb;
begin
  perform private.play80_require_staff_read();
  if use_panel_token then
    v_token:=p_panel_token;
    perform private.check_staff_pin_token(p_panel_token);
    if not exists(select 1 from private.staff_pin_sessions
      where user_id=auth.uid() and token_hash=encode(extensions.digest(p_panel_token,'sha256'),'hex')
      and login_scope='panel' and expires_at>now()) then raise exception 'Login PIN required to open the panel'; end if;
  end if;
  if not private.play80_check_login_pin(p_pin) then return jsonb_build_object('ok',false); end if;
  if not use_panel_token then
    v_token:=encode(extensions.gen_random_bytes(32),'hex');
    insert into private.staff_pin_sessions(token_hash,user_id,expires_at,login_scope)
    values(encode(extensions.digest(v_token,'sha256'),'hex'),auth.uid(),now()+interval '1 minute','action');
  end if;
  case p_action
    when 'staff_review_demo_request' then v_result:=jsonb_build_object('ok',true,'result',public.staff_review_demo_request(v_token,(p_payload->>'p_request_id')::uuid,(p_payload->>'p_decision')::text,(p_payload->>'p_review_note')::text));
    when 'staff_send_demo_coins' then v_result:=jsonb_build_object('ok',true,'result',public.staff_send_demo_coins(v_token,(p_payload->>'p_target_user')::uuid,(p_payload->>'p_amount')::bigint,(p_payload->>'p_operation_id')::uuid,(p_payload->>'p_note')::text));
    when 'staff_manage_admin' then v_result:=jsonb_build_object('ok',true,'result',public.staff_manage_admin(v_token,(p_payload->>'p_target_user')::uuid,(p_payload->>'p_action')::text));
    when 'play80_owner_bot_upsert' then v_result:=jsonb_build_object('ok',true,'result',public.play80_owner_bot_upsert(v_token,(p_payload->>'p_bot_id')::uuid,(p_payload->>'p_username')::text,(p_payload->>'p_avatar')::text,(p_payload->>'p_skill')::text,(p_payload->>'p_active')::boolean));
    when 'play80_owner_send_message' then v_result:=jsonb_build_object('ok',true,'result',public.play80_owner_send_message(v_token,(p_payload->>'p_user')::uuid,(p_payload->>'p_note')::text));
    when 'play80_owner_reclaim_coins' then v_result:=jsonb_build_object('ok',true,'result',public.play80_owner_reclaim_coins(v_token,(p_payload->>'p_target_user')::uuid,(p_payload->>'p_amount')::bigint,(p_payload->>'p_note')::text,(p_payload->>'p_operation_id')::uuid));
    when 'play80_owner_account_control' then v_result:=jsonb_build_object('ok',true,'result',public.play80_owner_account_control(v_token,(p_payload->>'p_target_user')::uuid,(p_payload->>'p_action')::text,(p_payload->>'p_note')::text));
    else raise exception 'Unsupported staff action';
  end case;
  if not use_panel_token then
    delete from private.staff_pin_sessions where token_hash=encode(extensions.digest(v_token,'sha256'),'hex') and user_id=auth.uid();
  end if;
  return v_result;
end $function$;
revoke all on function public.play80_confirm_staff_action(text,text,text,jsonb) from public, anon;
grant execute on function public.play80_confirm_staff_action(text,text,text,jsonb) to authenticated;

create function public.play80_owner_reply_support(p_user uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.play80_require_staff_read();
  if private.staff_role(auth.uid()) is distinct from 'owner' then
    raise exception 'Owner access required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_note,''))) not between 1 and 1000 then
    raise exception 'Enter a message 1-1000 characters';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,803));
  if not exists (select 1 from public.play80_support_messages where user_id=p_user) then
    raise exception 'Conversation does not exist';
  end if;
  insert into public.play80_support_messages(user_id,sender_id,sender_role,body,category)
    values(p_user,auth.uid(),'owner',btrim(p_note),'general');
  insert into public.owner_audit_log(actor_id,action,object_type,object_id,details)
    values(auth.uid(),'owner_message','user',p_user,jsonb_build_object('note',left(p_note,1000)));
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.play80_owner_reply_support(uuid,text) from public, anon;
grant execute on function public.play80_owner_reply_support(uuid,text) to authenticated;
