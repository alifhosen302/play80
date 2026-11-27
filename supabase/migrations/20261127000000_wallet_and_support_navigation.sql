-- Shared demo-coin reserve. Keep the signed-in operator as the audit actor.
create function private.play80_owner_reserve_id()
returns uuid language sql stable security definer set search_path='' as $$
  select id from auth.users
  where email_confirmed_at is not null and raw_app_meta_data->>'role'='owner'
  order by created_at, id limit 1
$$;
revoke all on function private.play80_owner_reserve_id() from public, anon, authenticated;

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
  select balance-held_balance into available from public.demo_wallets
    where user_id=private.play80_owner_reserve_id();
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

CREATE OR REPLACE FUNCTION private.check_staff_pin_token(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.play80_require_staff_read();
  if p_token is null or length(p_token)<30 or not exists (
    select 1 from private.staff_pin_sessions
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
      and user_id=auth.uid() and expires_at>now() and login_scope in ('panel','action')
  ) then raise exception 'Owner/Admin PIN unlock required'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.play80_open_owner_panel(p_pin text, p_scope text DEFAULT 'panel'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_token text;
begin
  perform private.play80_require_staff_read();
  if coalesce(private.staff_role(auth.uid()),'') not in ('owner','admin') or coalesce(p_scope,'') not in ('panel','dsr','admin') then
    raise exception 'Verified staff login required';
  end if;
  if p_scope='admin' and private.staff_role(auth.uid())<>'owner' then raise exception 'Owner login required'; end if;
  if not private.play80_check_login_pin(p_pin) then return jsonb_build_object('ok',false); end if;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  delete from private.staff_pin_sessions where user_id=auth.uid() and (expires_at<=now() or login_scope=p_scope);
  insert into private.staff_pin_sessions(token_hash,user_id,expires_at,login_scope)
  values(encode(extensions.digest(v_token,'sha256'),'hex'),auth.uid(),now()+interval '3 minutes',p_scope);
  return jsonb_build_object('ok',true,'token',v_token,'expires_in',180);
end $function$;

create function public.play80_authorize_staff_creation(p_pin_token text,p_role text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform private.play80_require_staff_read();
  if p_role is null or p_role not in ('dsr','admin') then
    raise exception 'Invalid staff role' using errcode='42501';
  end if;
  if p_role='admin' and private.staff_role(auth.uid()) is distinct from 'owner' then
    raise exception 'Owner login required' using errcode='42501';
  end if;
  delete from private.staff_pin_sessions where user_id=auth.uid()
    and token_hash=encode(extensions.digest(p_pin_token,'sha256'),'hex')
    and login_scope=p_role and expires_at>now();
  return found;
end $$;
revoke all on function public.play80_authorize_staff_creation(text,text) from public, anon;
grant execute on function public.play80_authorize_staff_creation(text,text) to authenticated;

CREATE OR REPLACE FUNCTION public.staff_list_admins(p_pin_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_data jsonb;
begin
 perform private.play80_require_staff_read();
 select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) into v_data
 from (
   select u.id,u.email,coalesce(p.username,'') as username,
          coalesce(u.raw_app_meta_data->>'role','player') as role,
          u.created_at,u.email_confirmed_at is not null as email_verified
   from auth.users u left join public.profiles p on p.id=u.id
   where u.raw_app_meta_data->>'role' in ('owner','admin','dsr')
   order by case when u.raw_app_meta_data->>'role'='owner' then 0 when u.raw_app_meta_data->>'role'='admin' then 1 else 2 end,u.created_at,u.id
 ) x;
 return v_data;
end;
$function$;

CREATE OR REPLACE FUNCTION public.play80_staff_user_page(p_pin_token text, p_search text DEFAULT ''::text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_data jsonb;
begin
 perform private.play80_require_staff_read();
 select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) into v_data
 from (
   select u.id, u.email, p.username,p.display_name,
       p.full_name,
       p.phone_number,
       p.address_text,
       coalesce(w.balance,0) as balance,coalesce(w.held_balance,0) as held_balance,
       coalesce(u.raw_app_meta_data->>'role','player') as role,
       u.created_at,u.email_confirmed_at is not null as email_verified,
       (u.banned_until is not null and u.banned_until>now()) as suspended
   from auth.users u
   left join public.profiles p on p.id=u.id
   left join public.demo_wallets w on w.user_id=u.id
   where nullif(btrim(p_search),'') is null
      or u.email ilike '%'||btrim(p_search)||'%'
      or p.display_name ilike '%'||btrim(p_search)||'%'
      or p.username ilike '%'||btrim(p_search)||'%'
      or u.id::text ilike '%'||btrim(p_search)||'%'
   order by u.created_at desc, u.id desc
   limit 51 offset greatest(coalesce(p_offset,0),0)
 ) x;
 return v_data;
end;
$function$;

CREATE OR REPLACE FUNCTION public.play80_menu_counts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  return jsonb_build_object('requests',0,'support',case when staff in ('owner','admin') then
    (select count(*) from private.play80_support_threads where needs_attention) else 0 end)||wallet;
end $function$;

create function public.play80_owner_reply_support(p_user uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.play80_require_staff_read();
  if length(btrim(coalesce(p_note,''))) not between 1 and 1000 then
    raise exception 'Enter a message 1-1000 characters';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,803));
  if not exists (select 1 from auth.users where id=p_user) then
    raise exception 'User does not exist';
  end if;
  insert into public.play80_support_messages(user_id,sender_id,sender_role,body,category)
    values(p_user,auth.uid(),'owner',btrim(p_note),'general');
  insert into public.owner_audit_log(actor_id,action,object_type,object_id,details)
    values(auth.uid(),'owner_message','user',p_user,jsonb_build_object('note',left(p_note,1000)));
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.play80_owner_reply_support(uuid,text) from public, anon;
grant execute on function public.play80_owner_reply_support(uuid,text) to authenticated;

CREATE OR REPLACE FUNCTION public.play80_owner_threads(p_search text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.play80_require_staff_read();

  return coalesce((select jsonb_agg(to_jsonb(t) order by t.needs_attention desc,t.at desc)
    from (select s.user_id, s.latest_id, left(s.preview,120) preview, s.at,
      s.needs_attention, s.message_count, p.username
      from private.play80_support_threads s left join public.profiles p on p.id=s.user_id
      where coalesce(btrim(p_search),'')='' or s.user_id::text ilike '%'||btrim(p_search)||'%'
          or p.username ilike '%'||btrim(p_search)||'%'
      order by s.needs_attention desc,s.at desc limit 100) t),'[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.play80_owner_open_thread(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.play80_require_staff_read();

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,803));
  update public.play80_support_messages set owner_read_at=now()
    where user_id=p_user and sender_role='player' and owner_read_at is null;
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at,t.id)
    from (select id,sender_role,body,category,created_at from public.play80_support_messages
      where user_id=p_user order by created_at desc,id desc limit 100) t),'[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.play80_owner_delete_thread(p_user uuid, p_latest uuid, p_count bigint, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.play80_require_staff_read();

  if not private.play80_check_login_pin(p_pin) then return jsonb_build_object('ok',false); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,803));
  if not exists (select 1 from private.play80_support_threads
      where user_id=p_user and latest_id=p_latest and message_count=p_count and not needs_attention)
    then raise exception 'Conversation changed or still needs a reply'; end if;
  delete from public.play80_support_messages where user_id=p_user;
  return jsonb_build_object('ok',true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.play80_owner_account_control(p_pin_token text, p_target_user uuid, p_action text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user auth.users%rowtype;
begin
 perform private.check_staff_pin_token(p_pin_token);

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
end $function$;

CREATE OR REPLACE FUNCTION public.play80_owner_bot_dashboard(p_pin_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE result jsonb;
BEGIN
  perform private.play80_require_staff_read();

 WITH full_list AS (
 SELECT c.id,c.username,c.avatar,c.skill,c.active,
    count(DISTINCT s.tournament_id) AS tournament_count,
    coalesce(sum(s.games_played),0) AS games_played,
    coalesce(sum(s.total_score),0) AS total_score,
    coalesce(max(s.highest_score),0) AS highest_score,
    coalesce((SELECT d.play_seconds FROM public.computer_player_daily_limits d
       WHERE d.bot_id=c.id AND d.play_date=(now() AT TIME ZONE 'UTC')::date),0) AS today_seconds,
    coalesce((SELECT sum(d.play_seconds) FROM public.computer_player_daily_limits d WHERE d.bot_id=c.id),0) AS all_seconds,
    coalesce((SELECT sum(r.reward) FROM public.tournament_rewards r WHERE r.bot_id=c.id),0) AS virtual_rewards
 FROM public.computer_players c LEFT JOIN public.computer_player_scores s ON s.bot_id=c.id
 GROUP BY c.id)
 SELECT jsonb_build_object('total',count(*),'active',count(*) FILTER(WHERE active),
    'daily_limit_seconds',28800,'three_day_limit_seconds',86400,
    'bots',coalesce(jsonb_agg(to_jsonb(full_list) ORDER BY username),'[]'::jsonb)) INTO result FROM full_list;
 RETURN result;
END$function$;

CREATE OR REPLACE FUNCTION public.play80_owner_bot_upsert(p_pin_token text, p_bot_id uuid, p_username text, p_avatar text, p_skill text, p_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_id uuid;
BEGIN
 PERFORM private.check_staff_pin_token(p_pin_token);

 IF length(btrim(p_username)) NOT BETWEEN 3 AND 40 OR length(p_avatar) NOT BETWEEN 1 AND 64
    OR p_skill NOT IN('easy','medium','advanced','expert') THEN
   RAISE EXCEPTION 'Invalid name, avatar or skill'; END IF;
 IF p_bot_id IS NULL THEN
   INSERT INTO public.computer_players(username,avatar,skill,active)
    VALUES(btrim(p_username),p_avatar,p_skill,coalesce(p_active,true)) RETURNING id INTO v_id;
 ELSE
   UPDATE public.computer_players SET username=btrim(p_username),avatar=p_avatar,skill=p_skill,
     active=coalesce(p_active,true) WHERE id=p_bot_id RETURNING id INTO v_id;
   IF v_id IS NULL THEN RAISE EXCEPTION 'AI player not found'; END IF;
 END IF;
 INSERT INTO public.owner_audit_log(actor_id,action,object_type,object_id,details)
 VALUES(auth.uid(),'configure_ai_profile','computer_player',v_id,
 jsonb_build_object('username',p_username,'skill',p_skill,'active',p_active));
 RETURN jsonb_build_object('ok',true,'bot_id',v_id,'applies_to','future_tournaments');
END$function$;

CREATE OR REPLACE FUNCTION public.play80_owner_tournament_dashboard(p_pin_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v jsonb;
BEGIN
  perform private.play80_require_staff_read();

 SELECT jsonb_build_object(
 'tournaments',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC),'[]'::jsonb)
   FROM (SELECT id,title,status,starts_at,ends_at,bot_count,created_at FROM public.tournaments ORDER BY created_at DESC LIMIT 20) t),
 'scheduler',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.occurred_at DESC),'[]'::jsonb)
   FROM (SELECT id,event,tournament_id,detail,occurred_at FROM public.scheduler_logs ORDER BY id DESC LIMIT 20) l),
 'ai_reward_total',(SELECT coalesce(sum(amount),0) FROM public.company_virtual_ledger WHERE entry_type='ai_prize_return'),
 'human_reward_total',(SELECT coalesce(sum(reward),0) FROM public.tournament_rewards WHERE player_type='human')) INTO v;
 RETURN v;
END$function$;

CREATE OR REPLACE FUNCTION public.play80_owner_transfer(p_pin text, p_player uuid, p_direction text, p_amount bigint, p_note text, p_operation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid:=auth.uid();
  reserve_id uuid;
  source_id uuid; destination_id uuid;
  v_source_after bigint; v_destination_after bigint;
  old_op private.play80_owner_transfers%rowtype;
  note text:=btrim(coalesce(p_note,''));
begin
  perform private.play80_require_staff_read();
  reserve_id:=private.play80_owner_reserve_id();
  if reserve_id is null then raise exception 'Owner reserve not found'; end if;
  if p_player is null or p_player=actor or p_direction is null or p_direction not in ('send','receive')
    or p_amount is null or p_amount<1 or p_amount>9007199254740991 or p_operation is null or length(note)>200 then
    raise exception 'Invalid coin transfer';
  end if;
  if not exists(select 1 from auth.users where id=p_player and email_confirmed_at is not null
    and coalesce(raw_app_meta_data->>'role','player')='player') then raise exception 'Verified Player account required'; end if;
  if not private.play80_check_login_pin(p_pin) then return jsonb_build_object('ok',false); end if;
  insert into private.play80_owner_transfers(operation_id,owner_id,player_id,direction,amount)
  values(p_operation,actor,p_player,p_direction,p_amount) on conflict do nothing;
  if not found then
    select * into old_op from private.play80_owner_transfers where operation_id=p_operation;
    if (old_op.owner_id,old_op.player_id,old_op.direction,old_op.amount) is distinct from (actor,p_player,p_direction,p_amount) then
      raise exception 'Transfer operation does not match';
    end if;
    return jsonb_build_object('ok',true,'duplicate',true);
  end if;
  source_id:=case when p_direction='send' then reserve_id else p_player end;
  destination_id:=case when p_direction='send' then p_player else reserve_id end;
  perform 1 from public.demo_wallets where user_id in (source_id,destination_id) order by user_id for update;
  update public.demo_wallets set balance=balance-p_amount,updated_at=now()
    where user_id=source_id and balance-held_balance>=p_amount returning balance into v_source_after;
  if not found then raise exception 'পর্যাপ্ত ব্যবহারযোগ্য কয়েন নেই।'; end if;
  update public.demo_wallets set balance=balance+p_amount,updated_at=now()
    where user_id=destination_id and balance<=9007199254740991-p_amount returning balance into v_destination_after;
  if not found then raise exception 'প্রাপকের ওয়ালেট পাওয়া যায়নি বা ব্যালেন্স সীমা অতিক্রম করেছে।'; end if;
  insert into public.demo_wallet_ledger(user_id,delta,balance_after,reason)
  values(source_id,-p_amount,v_source_after,'demo_adjustment'),(destination_id,p_amount,v_destination_after,'demo_adjustment');
  update private.play80_owner_transfers set source_after=v_source_after, destination_after=v_destination_after where operation_id=p_operation;
  insert into public.owner_audit_log(actor_id,action,object_type,object_id,details)
  values(actor,'owner_transfer_demo_coins','user',p_player,jsonb_build_object('amount',p_amount,'direction',p_direction,'note',note,'operation_id',p_operation));
  insert into public.play80_support_messages(user_id,sender_id,sender_role,body,category)
  values(p_player,actor,'owner',(case when p_direction='send' then 'Owner কয়েন পাঠিয়েছেন: +' else 'Owner কয়েন নিয়েছেন: −' end)
    ||p_amount||' কয়েন।'||case when note='' then '' else ' নোট: '||note end,'coin_adjustment');
  return jsonb_build_object('ok',true,'player_balance',case when p_direction='send' then v_destination_after else v_source_after end);
end $function$;
