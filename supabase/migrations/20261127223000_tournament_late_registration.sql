-- New Memory events allow free registration until the event ends.
-- Keep existing fee, deadline, verification, scoring and legacy client guards.
CREATE OR REPLACE FUNCTION private.play80_open_next_tournament()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_id uuid; v_game text; v_rules jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.tournaments WHERE status IN('registration_open','running')) THEN RETURN NULL; END IF;
  SELECT game_code,rules INTO v_game,v_rules FROM public.tournament_game_rotation
    WHERE enabled AND game_code='memory' ORDER BY priority LIMIT 1;
  IF v_game IS NULL THEN RAISE EXCEPTION 'No verified tournament game enabled'; END IF;
  INSERT INTO public.tournaments(game_code,title,description,status,starts_at,ends_at,max_players,
    registration_opened_at,registration_ends_at,announced_rules)
  VALUES(v_game,'PLAY80 • Memory Puzzle','72-hour skill tournament • nonredeemable virtual coins',
    'registration_open',now()+interval '3 hours',now()+interval '75 hours',100000,
    now(),now()+interval '3 hours', jsonb_build_object('game',v_rules,'entry_fee',500,'prize_cap',7500,
    'prizes',jsonb_build_array(1800,1200,1000,900,800,700,600,500),
    'bots_minimum',15,'ai_reward_to_company_virtual_ledger',true,
    'late_registration',true,'demo_only',true,'fee_mode','per_round','registration_hours',3,'play_hours',72)) RETURNING id INTO v_id;
  INSERT INTO public.tournament_schedules(tournament_id,job_type,scheduled_for)
    VALUES(v_id,'registration_end',now()+interval '3 hours');
  INSERT INTO public.scheduler_logs(event,tournament_id) VALUES('registration_open',v_id);
  RETURN v_id;
END$function$;

CREATE OR REPLACE FUNCTION public.play80_tournament_join_v2(p_tournament_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_user uuid:=auth.uid();v_t public.tournaments%ROWTYPE;v_wallet bigint;v_held bigint;
BEGIN
 IF v_user IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_user AND u.email_confirmed_at IS NOT NULL AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<=now()) AND coalesce(u.raw_app_meta_data->>'role','player')='player') THEN RAISE EXCEPTION 'Verified player login required'; END IF;
 SELECT * INTO v_t FROM public.tournaments WHERE id=p_tournament_id FOR UPDATE;
 IF v_t.id IS NULL OR v_t.status NOT IN('registration_open','running') OR
    now()>=v_t.ends_at THEN
   RAISE EXCEPTION 'Registration is closed'; END IF;
 IF EXISTS(SELECT 1 FROM public.tournament_entries WHERE tournament_id=v_t.id AND user_id=v_user) THEN
   RETURN jsonb_build_object('joined',true,'already_joined',true,'charged',0);
 END IF;
 IF v_t.announced_rules->>'fee_mode'='per_round' THEN
   IF NOT ((v_t.status='registration_open' AND now()<v_t.registration_ends_at)
      OR (coalesce(v_t.announced_rules->>'late_registration','false')='true' AND v_t.status IN ('registration_open','running') AND now()<v_t.ends_at))
   THEN RAISE EXCEPTION 'Registration is closed'; END IF;
   INSERT INTO public.tournament_entries(tournament_id,user_id,status) VALUES(v_t.id,v_user,'registered');
   RETURN jsonb_build_object('joined',true,'already_joined',false,'charged',0,'fee_mode','per_round');
 END IF;
 SELECT balance,held_balance INTO v_wallet,v_held FROM public.demo_wallets
   WHERE user_id=v_user FOR UPDATE;
 IF v_wallet IS NULL OR v_wallet-coalesce(v_held,0)<500 THEN
   RAISE EXCEPTION 'Insufficient available nonredeemable demo coins'; END IF;
 UPDATE public.demo_wallets SET balance=balance-500,updated_at=now() WHERE user_id=v_user
   RETURNING balance INTO v_wallet;
 INSERT INTO public.tournament_entries(tournament_id,user_id,status) VALUES(v_t.id,v_user,'registered');
 INSERT INTO public.tournament_ledger(tournament_id,user_id,entry_type,amount,operation_key)
 VALUES(v_t.id,v_user,'human_entry',500,'entry:'||v_t.id||':'||v_user);
 INSERT INTO public.wallet_transactions(user_id,tournament_id,transaction_type,delta,balance_after,operation_key,description)
 VALUES(v_user,v_t.id,'tournament_entry',-500,v_wallet,'entry:'||v_t.id||':'||v_user,'One-time tournament entry');
 RETURN jsonb_build_object('joined',true,'already_joined',false,'charged',500,'balance',v_wallet);
END$function$;

revoke all on function private.play80_open_next_tournament() from public,anon,authenticated;
revoke all on function public.play80_tournament_join_v2(uuid) from public,anon;
grant execute on function public.play80_tournament_join_v2(uuid) to authenticated;

-- The currently announced empty event can adopt the new registration rule
-- without changing any existing entrant's terms or moving its clock.
update public.tournaments t
set announced_rules=coalesce(t.announced_rules,'{}'::jsonb)||jsonb_build_object('late_registration',true)
where t.game_code='memory' and t.status in ('registration_open','running')
 and t.ends_at>now() and t.announced_rules->>'fee_mode'='per_round'
 and not exists(select 1 from public.tournament_entries e where e.tournament_id=t.id);
