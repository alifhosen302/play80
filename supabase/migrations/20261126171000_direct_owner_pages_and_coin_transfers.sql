create function private.play80_require_staff_read()
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until<=now()) and u.raw_app_meta_data->>'role' in ('owner','admin')
  ) then raise exception 'Verified staff login required' using errcode='42501'; end if;
end $$;
revoke all on function private.play80_require_staff_read() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.play80_mark_support_read(p_pin_token text, p_message uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or private.staff_role(auth.uid()) is distinct from 'owner' then
    raise exception 'Owner access required';
  end if;
  perform private.play80_require_staff_read();
  update public.play80_support_messages set owner_read_at=now()
  where id=p_message and sender_role='player' and owner_read_at is null;
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
 IF private.staff_role(auth.uid())<>'owner' THEN RAISE EXCEPTION 'Owner only'; END IF;
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

CREATE OR REPLACE FUNCTION public.play80_owner_support_messages(p_pin_token text, p_search text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.play80_require_staff_read();
 if private.staff_role(auth.uid()) is distinct from 'owner' then raise exception 'Owner access required'; end if;
 return coalesce((select jsonb_agg(row_to_json(t) order by (t.sender_role='player' and t.owner_read_at is null) desc,t.created_at desc)
 from (select m.id,m.user_id,m.sender_role,m.category,m.body,m.created_at,m.owner_read_at,p.username,u.email
 from public.play80_support_messages m
 join auth.users u on u.id=m.user_id left join public.profiles p on p.id=m.user_id
 where nullif(btrim(p_search),'') is null
 or u.id::text ilike '%'||btrim(p_search)||'%'
 or u.email ilike '%'||btrim(p_search)||'%'
 or p.username ilike '%'||btrim(p_search)||'%'
 order by (m.sender_role='player' and m.owner_read_at is null) desc, m.created_at desc limit 100)t),'[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.play80_owner_tournament_dashboard(p_pin_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v jsonb;
BEGIN
  perform private.play80_require_staff_read();
 IF private.staff_role(auth.uid())<>'owner' THEN RAISE EXCEPTION 'Owner only'; END IF;
 SELECT jsonb_build_object(
 'tournaments',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC),'[]'::jsonb)
   FROM (SELECT id,title,status,starts_at,ends_at,bot_count,created_at FROM public.tournaments ORDER BY created_at DESC LIMIT 20) t),
 'scheduler',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.occurred_at DESC),'[]'::jsonb)
   FROM (SELECT id,event,tournament_id,detail,occurred_at FROM public.scheduler_logs ORDER BY id DESC LIMIT 20) l),
 'ai_reward_total',(SELECT coalesce(sum(amount),0) FROM public.company_virtual_ledger WHERE entry_type='ai_prize_return'),
 'human_reward_total',(SELECT coalesce(sum(reward),0) FROM public.tournament_rewards WHERE player_type='human')) INTO v;
 RETURN v;
END$function$;

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
   select u.id, u.email, p.username,p.display_name,p.full_name,p.phone_number,p.address_text,
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

CREATE OR REPLACE FUNCTION public.staff_active_games(p_pin_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_data jsonb;
begin
 perform private.play80_require_staff_read();
 select coalesce(jsonb_agg(row_to_json(a)),'[]'::jsonb) into v_data from (
   select s.user_id,u.email,p.username,s.game_code,c.title,
     s.started_at,s.last_seen
   from public.game_sessions s
    join auth.users u on u.id=s.user_id
    left join public.profiles p on p.id=s.user_id
    join public.game_catalog c on c.code=s.game_code
   where s.ended_at is null and s.last_seen>now()-interval '120 seconds'
   order by s.last_seen desc limit 100
 ) a;
 return v_data;
end;
$function$;

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
          u.created_at
   from auth.users u left join public.profiles p on p.id=u.id
   where u.raw_app_meta_data->>'role' in ('owner','admin')
   order by case when u.raw_app_meta_data->>'role'='owner' then 0 else 1 end,u.created_at
 ) x;
 return v_data;
end;
$function$;

create function public.play80_staff_overview()
returns jsonb language plpgsql security definer set search_path='' as $$
declare counts jsonb; active jsonb; coins bigint;
  day_start timestamptz := date_trunc('day',timezone('Asia/Dhaka',now())) at time zone 'Asia/Dhaka';
begin
  perform private.play80_require_staff_read();
  select jsonb_build_object(
    'today_deposit',coalesce(sum(amount) filter(where request_kind='demo_credit' and reviewed_at>=day_start),0),
    'today_withdraw',coalesce(sum(amount) filter(where request_kind='demo_debit' and reviewed_at>=day_start),0),
    'total_deposit',coalesce(sum(amount) filter(where request_kind='demo_credit'),0),
    'total_withdraw',coalesce(sum(amount) filter(where request_kind='demo_debit'),0),
    'deposit_users',count(distinct user_id) filter(where request_kind='demo_credit'),
    'withdraw_users',count(distinct user_id) filter(where request_kind='demo_debit')
  ) into counts from public.demo_wallet_requests where status='approved';
  select coalesce(sum(w.balance),0) into coins from public.demo_wallets w
    join auth.users u on u.id=w.user_id where coalesce(u.raw_app_meta_data->>'role','player')='player';
  active:=public.staff_active_games(null);
  return counts||jsonb_build_object('users',(select count(*) from auth.users),'games',active,'player_coins',coins);
end $$;
revoke all on function public.play80_staff_overview() from public, anon;
grant execute on function public.play80_staff_overview() to authenticated;

create table private.play80_owner_transfers (
  operation_id uuid primary key,
  owner_id uuid not null,
  player_id uuid not null,
  direction text not null,
  amount bigint not null,
  source_after bigint,
  destination_after bigint
);
alter table private.play80_owner_transfers enable row level security;
revoke all on private.play80_owner_transfers from public, anon, authenticated;

create function public.play80_owner_transfer(p_pin text,p_player uuid,p_direction text,p_amount bigint,p_note text,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  source_id uuid; destination_id uuid;
  v_source_after bigint; v_destination_after bigint;
  old_op private.play80_owner_transfers%rowtype;
  note text:=btrim(coalesce(p_note,''));
begin
  perform private.play80_require_staff_read();
  if private.staff_role(actor) is distinct from 'owner' then raise exception 'Owner access required'; end if;
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
  source_id:=case when p_direction='send' then actor else p_player end;
  destination_id:=case when p_direction='send' then p_player else actor end;
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
end $$;
revoke all on function public.play80_owner_transfer(text,uuid,text,bigint,text,uuid) from public, anon;
grant execute on function public.play80_owner_transfer(text,uuid,text,bigint,text,uuid) to authenticated;


CREATE OR REPLACE FUNCTION public.play80_confirm_staff_action(p_panel_token text, p_pin text, p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_token text:=p_panel_token; v_result jsonb;
begin
  perform private.play80_require_staff_read();
  if p_action='staff_review_demo_request' then
    perform private.check_staff_pin_token(p_panel_token);
    if not exists(select 1 from private.staff_pin_sessions
      where user_id=auth.uid() and token_hash=encode(extensions.digest(p_panel_token,'sha256'),'hex')
      and login_scope='panel' and expires_at>now()) then raise exception 'Login PIN required to open the panel'; end if;
  end if;
  if not private.play80_check_login_pin(p_pin) then return jsonb_build_object('ok',false); end if;
  if p_action<>'staff_review_demo_request' then
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
  if p_action<>'staff_review_demo_request' then
    delete from private.staff_pin_sessions where token_hash=encode(extensions.digest(v_token,'sha256'),'hex') and user_id=auth.uid();
  end if;
  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.play80_owner_reclaim_coins(p_pin_token text, p_target_user uuid, p_amount bigint, p_note text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 values(p_target_user,-p_amount,v_balance,'demo_adjustment');
 insert into public.owner_audit_log(actor_id,action,object_type,object_id,details)
 values(auth.uid(),'reclaim_demo_coins','user',p_target_user,jsonb_build_object('amount',p_amount,'note',btrim(p_note),'operation_id',p_operation_id));
 insert into public.play80_support_messages(user_id,sender_id,sender_role,body,category)
 values(p_target_user,auth.uid(),'owner','Coin correction: -'||p_amount||' Demo Coins. '||btrim(p_note),'coin_adjustment');
 return jsonb_build_object('ok',true,'duplicate',false,'balance_after',v_balance);
end $function$;
