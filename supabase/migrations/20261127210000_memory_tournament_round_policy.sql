-- Future Memory events use the new disclosed, nonredeemable demo round policy. Existing events retain their published rules.
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
    'late_registration',false,'demo_only',true,'fee_mode','per_round','registration_hours',3,'play_hours',72)) RETURNING id INTO v_id;
  INSERT INTO public.tournament_schedules(tournament_id,job_type,scheduled_for)
    VALUES(v_id,'registration_end',now()+interval '3 hours');
  INSERT INTO public.scheduler_logs(event,tournament_id) VALUES('registration_open',v_id);
  RETURN v_id;
END$function$;

CREATE OR REPLACE FUNCTION public.play80_tournament_join(p_tournament_id uuid)
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
    (v_t.status='running' AND now()>=v_t.ends_at) THEN
   RAISE EXCEPTION 'Registration is closed'; END IF;
 IF EXISTS(SELECT 1 FROM public.tournament_entries WHERE tournament_id=v_t.id AND user_id=v_user) THEN
   RETURN jsonb_build_object('joined',true,'already_joined',true,'charged',0);
 END IF;
 IF v_t.announced_rules->>'fee_mode'='per_round' THEN
   IF v_t.status<>'registration_open' OR now()>=v_t.registration_ends_at THEN RAISE EXCEPTION 'Registration is closed'; END IF;
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

CREATE OR REPLACE FUNCTION public.play80_memory_start(p_tournament_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_user uuid:=auth.uid(); v_id uuid; v_deck smallint[];v_t public.tournaments%ROWTYPE;v_wallet bigint;v_held bigint;v_charge bigint:=0;
BEGIN
 IF v_user IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_user AND u.email_confirmed_at IS NOT NULL AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<=now()) AND coalesce(u.raw_app_meta_data->>'role','player')='player') THEN RAISE EXCEPTION 'Verified player login required'; END IF;
 SELECT * INTO v_t FROM public.tournaments WHERE id=p_tournament_id FOR UPDATE;
 IF NOT FOUND OR v_t.game_code<>'memory' OR v_t.status<>'running' OR v_t.starts_at>now() OR v_t.ends_at<=now() THEN RAISE EXCEPTION 'Memory tournament not active'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tournament_entries WHERE user_id=v_user AND tournament_id=p_tournament_id) THEN
   RAISE EXCEPTION 'Join tournament first'; END IF;
 SELECT id INTO v_id FROM public.memory_runs WHERE tournament_id=p_tournament_id AND user_id=v_user
    AND finished_at IS NULL ORDER BY started_at DESC LIMIT 1;
 IF v_id IS NOT NULL THEN RETURN jsonb_build_object('run_id',v_id,'resumed',true); END IF;
 SELECT array_agg(x.card ORDER BY x.shuf)::smallint[] INTO v_deck FROM
 (SELECT (i % 8 + 1)::smallint AS card,random() AS shuf FROM generate_series(0,15) i) x;
 INSERT INTO public.memory_runs(tournament_id,user_id,deck) VALUES(p_tournament_id,v_user,v_deck)
 RETURNING id INTO v_id;
 IF v_t.announced_rules->>'fee_mode'='per_round' THEN
   SELECT balance,held_balance INTO v_wallet,v_held FROM public.demo_wallets WHERE user_id=v_user FOR UPDATE;
   IF v_wallet IS NULL OR v_wallet-coalesce(v_held,0)<500 THEN RAISE EXCEPTION 'Insufficient available nonredeemable demo coins'; END IF;
   UPDATE public.demo_wallets SET balance=balance-500,updated_at=now() WHERE user_id=v_user RETURNING balance INTO v_wallet;
   INSERT INTO public.tournament_ledger(tournament_id,user_id,entry_type,amount,operation_key)
     VALUES(p_tournament_id,v_user,'human_round',500,'memory_round:'||v_id);
   INSERT INTO public.wallet_transactions(user_id,tournament_id,transaction_type,delta,balance_after,operation_key,description)
     VALUES(v_user,p_tournament_id,'tournament_entry',-500,v_wallet,'memory_round:'||v_id,'New verified Memory demo round');
   v_charge:=500;
 END IF;
 RETURN jsonb_build_object('run_id',v_id,'resumed',false,'charged',v_charge);
END$function$;

CREATE OR REPLACE FUNCTION private.play80_finalize_tournament(p_tournament uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_t public.tournaments%ROWTYPE;v_pool bigint;v_total bigint:=0;v_amount bigint;
 v_cap bigint[]:=ARRAY[1800,1200,1000,900,800,700,600,500];v_wallet bigint;
 rec record;
BEGIN
 SELECT * INTO v_t FROM public.tournaments WHERE id=p_tournament FOR UPDATE;
 IF v_t.id IS NULL OR v_t.status<>'running' OR v_t.ends_at>now() OR v_t.finalized_at IS NOT NULL THEN RETURN; END IF;
 IF v_t.announced_rules->>'fee_mode'='per_round' THEN SELECT least(7500,coalesce(sum(amount),0)) INTO v_pool FROM public.tournament_ledger WHERE tournament_id=p_tournament AND entry_type='human_round'; ELSE SELECT LEAST(7500,count(*)*500) INTO v_pool FROM public.tournament_entries WHERE tournament_id=p_tournament; END IF;
 FOR rec IN
  WITH competitors AS (
    SELECT 'human'::text kind,e.user_id AS user_id,NULL::uuid AS bot_id,
      coalesce(s.total_score,0) AS total_score,coalesce(s.highest_score,0) AS highest_score,
      coalesce(s.games_played,0) AS games_played,e.user_id::text AS sid
    FROM public.tournament_entries e LEFT JOIN public.tournament_scores s
      ON s.tournament_id=e.tournament_id AND s.user_id=e.user_id
    WHERE e.tournament_id=p_tournament AND (coalesce(v_t.announced_rules->>'fee_mode','legacy')<>'per_round' OR coalesce(s.games_played,0)>0)
    UNION ALL
    SELECT 'ai',NULL::uuid,s.bot_id,s.total_score,s.highest_score,s.games_played,s.bot_id::text
      FROM public.computer_player_scores s WHERE s.tournament_id=p_tournament AND (coalesce(v_t.announced_rules->>'fee_mode','legacy')<>'per_round' OR s.games_played>0)
   )
   SELECT *,row_number() OVER(ORDER BY total_score DESC,highest_score DESC,games_played DESC,sid ASC)::int rank
   FROM competitors ORDER BY rank LIMIT 8
 LOOP
   v_amount:=(v_pool*v_cap[rec.rank])/7500;
   v_total:=v_total+v_amount;
   INSERT INTO public.tournament_rewards(tournament_id,final_rank,player_type,user_id,bot_id,reward)
    VALUES(p_tournament,rec.rank,rec.kind,rec.user_id,rec.bot_id,v_amount)
    ON CONFLICT(tournament_id,final_rank) DO NOTHING;
   IF rec.kind='ai' THEN
     INSERT INTO public.company_virtual_ledger(tournament_id,bot_id,entry_type,amount,operation_key)
     VALUES(p_tournament,rec.bot_id,'ai_prize_return',v_amount,'ai_reward:'||p_tournament||':'||rec.rank)
     ON CONFLICT(operation_key) DO NOTHING;
   ELSIF v_amount>0 THEN
     UPDATE public.demo_wallets SET balance=balance+v_amount,updated_at=now()
       WHERE user_id=rec.user_id RETURNING balance INTO v_wallet;
     IF v_wallet IS NULL THEN
       INSERT INTO public.demo_wallets(user_id,balance) VALUES(rec.user_id,v_amount)
       ON CONFLICT(user_id) DO UPDATE SET balance=public.demo_wallets.balance+v_amount
       RETURNING balance INTO v_wallet;
     END IF;
     INSERT INTO public.wallet_transactions(user_id,tournament_id,transaction_type,delta,balance_after,operation_key,description)
     VALUES(rec.user_id,p_tournament,'tournament_reward',v_amount,v_wallet,
       'reward:'||p_tournament||':'||rec.user_id,'Final ranked virtual skill reward');
     INSERT INTO public.notifications(user_id,title,body)
     VALUES(rec.user_id,'Tournament results published',
       'Rank '||rec.rank||' • '||v_amount||' nonredeemable demo coins credited.');
   END IF;
 END LOOP;
 IF v_total<v_pool THEN
   INSERT INTO public.company_virtual_ledger(tournament_id,entry_type,amount,operation_key)
     VALUES(p_tournament,'unallocated_pool',v_pool-v_total,'unallocated:'||p_tournament)
     ON CONFLICT(operation_key) DO NOTHING;
 END IF;
 UPDATE public.tournaments SET status='finished',finalized_at=now() WHERE id=p_tournament;
 INSERT INTO public.scheduler_logs(event,tournament_id,detail)
   VALUES('tournament_finished',p_tournament,jsonb_build_object('pool',v_pool,'allocated',v_total));
 PERFORM private.play80_open_next_tournament();
END$function$;

CREATE OR REPLACE FUNCTION private.play80_tournament_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE t public.tournaments%ROWTYPE; v_humans integer; v_bot_count integer; v_bot record; v_created uuid;
BEGIN
 IF NOT pg_try_advisory_xact_lock(6020261124) THEN
   RETURN jsonb_build_object('skipped','already running'); END IF;
 SELECT * INTO t FROM public.tournaments WHERE status IN ('registration_open','running')
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF t.id IS NULL THEN
   v_created:=private.play80_open_next_tournament();
   RETURN jsonb_build_object('new_tournament',v_created,'state','registration_open');
 END IF;
 IF t.status='registration_open' THEN
   SELECT count(*) INTO v_humans FROM public.tournament_entries WHERE tournament_id=t.id;
   IF (coalesce(t.announced_rules->>'fee_mode','legacy')<>'per_round' AND v_humans>=15) OR now()>=t.registration_ends_at THEN
     IF v_humans=0 AND coalesce(t.announced_rules->>'fee_mode','legacy')<>'per_round' THEN
       UPDATE public.tournaments SET registration_opened_at=now(),registration_ends_at=now()+interval '3 hours',
         starts_at=now()+interval '3 hours',ends_at=now()+interval '75 hours'
       WHERE id=t.id;
       UPDATE public.tournament_schedules SET scheduled_for=now()+interval '3 hours',processed_at=NULL
        WHERE tournament_id=t.id AND job_type='registration_end';
       INSERT INTO public.scheduler_logs(event,tournament_id) VALUES('no_humans_countdown_restarted',t.id);
     ELSE
       v_bot_count:=CASE WHEN t.announced_rules->>'fee_mode'='per_round' THEN 15 ELSE GREATEST(5,15-v_humans) END;
       INSERT INTO public.computer_player_scores(tournament_id,bot_id)
       SELECT t.id,c.id FROM public.computer_players c WHERE c.active ORDER BY c.created_at,c.id LIMIT v_bot_count
       ON CONFLICT DO NOTHING;
       IF (SELECT count(*) FROM public.computer_player_scores WHERE tournament_id=t.id)<>v_bot_count THEN
         RAISE EXCEPTION 'Insufficient transparent bot profiles'; END IF;
       UPDATE public.tournaments SET status='running',starts_at=CASE WHEN t.announced_rules->>'fee_mode'='per_round' THEN t.registration_ends_at ELSE now() END,ends_at=CASE WHEN t.announced_rules->>'fee_mode'='per_round' THEN t.registration_ends_at+interval '72 hours' ELSE now()+interval '72 hours' END,bot_count=v_bot_count WHERE id=t.id;
       INSERT INTO public.tournament_schedules(tournament_id,job_type,scheduled_for)
         VALUES(t.id,'tournament_end',CASE WHEN t.announced_rules->>'fee_mode'='per_round' THEN t.registration_ends_at+interval '72 hours' ELSE now()+interval '72 hours' END) ON CONFLICT(tournament_id,job_type)
         DO UPDATE SET scheduled_for=EXCLUDED.scheduled_for;
       UPDATE public.tournament_schedules SET processed_at=now() WHERE tournament_id=t.id AND job_type='registration_end';
       INSERT INTO public.scheduler_logs(event,tournament_id,detail)
         VALUES('tournament_started',t.id,jsonb_build_object('humans',v_humans,'bots',v_bot_count));
     END IF;
   END IF;
 ELSIF t.status='running' THEN
   IF now()>=t.ends_at THEN
     PERFORM private.play80_finalize_tournament(t.id);
   ELSE
     FOR v_bot IN SELECT bot_id FROM public.computer_player_scores
      WHERE tournament_id=t.id ORDER BY bot_id LOOP
       PERFORM private.play80_bot_memory_tick(t.id,v_bot.bot_id);
     END LOOP;
   END IF;
 END IF;
 RETURN jsonb_build_object('ok',true,'tournament_id',t.id);
END$function$;

CREATE OR REPLACE FUNCTION public.play80_tournament_public()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE t public.tournaments%ROWTYPE; h int; b int; myentry boolean:=false; myscore bigint:=0;v_pool bigint;
BEGIN
 SELECT * INTO t FROM public.tournaments WHERE status IN('registration_open','running') ORDER BY created_at DESC LIMIT 1;
 IF t.id IS NULL THEN RETURN jsonb_build_object('status','idle','server_time',now()); END IF;
 SELECT count(*) INTO h FROM public.tournament_entries WHERE tournament_id=t.id;
 SELECT count(*) INTO b FROM public.computer_player_scores WHERE tournament_id=t.id;
 IF auth.uid() IS NOT NULL THEN
   SELECT EXISTS(SELECT 1 FROM public.tournament_entries WHERE tournament_id=t.id AND user_id=auth.uid()) INTO myentry;
   SELECT coalesce(s.total_score,0) INTO myscore FROM public.tournament_scores s
     WHERE tournament_id=t.id AND user_id=auth.uid();
 END IF;
 IF t.announced_rules->>'fee_mode'='per_round' THEN SELECT least(7500,coalesce(sum(amount),0)) INTO v_pool FROM public.tournament_ledger WHERE tournament_id=t.id AND entry_type='human_round'; ELSE v_pool:=least(7500,h*500); END IF;
 RETURN jsonb_build_object('fee_mode',coalesce(t.announced_rules->>'fee_mode','once'),'id',t.id,'game',t.game_code,'status',t.status,'server_time',now(),
 'registration_ends_at',t.registration_ends_at,'starts_at',t.starts_at,'ends_at',t.ends_at,
 'human_count',h,'bot_count',b,'planned_bot_count',CASE WHEN t.announced_rules->>'fee_mode'='per_round' THEN 15 WHEN h>0 THEN GREATEST(5,15-h) ELSE 0 END,
 'participants',h+b,
 'entry_fee',500,'funded_pool',v_pool,'maximum_pool',7500,
 'joined',myentry,'my_score',coalesce(myscore,0),'rules',t.announced_rules);
END$function$;

create or replace function public.play80_tournament_winners(p_game text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_event uuid;v_end timestamptz;
begin
 if p_game not in ('memory','blockpuzzle','bubbles','game2048') then raise exception 'Invalid tournament game'; end if;
 select id,ends_at into v_event,v_end from public.tournaments where game_code=p_game and status='finished' order by ends_at desc,id desc limit 1;
 return jsonb_build_object('ends_at',v_end,'winners',coalesce((select jsonb_agg(jsonb_build_object(
 'rank',r.final_rank,'username',case when r.player_type='ai' then coalesce(bs.bot_username,'AI') else coalesce(p.username,'Player') end,'type',r.player_type,'reward',r.reward,'score',coalesce(hs.total_score,bs.total_score,0)) order by r.final_rank)
 from public.tournament_rewards r left join public.profiles p on p.id=r.user_id
 left join public.tournament_scores hs on hs.tournament_id=r.tournament_id and hs.user_id=r.user_id
 left join public.computer_player_scores bs on bs.tournament_id=r.tournament_id and bs.bot_id=r.bot_id where r.tournament_id=v_event),'[]'::jsonb));
end $$;
revoke all on function public.play80_tournament_winners(text) from public,anon;
grant execute on function public.play80_tournament_winners(text) to authenticated;
create or replace function public.play80_owner_ai_activity()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.play80_require_staff_read();
 return coalesce((select jsonb_agg(jsonb_build_object('bot_id',b.id,'name',b.username,'active',b.active,'game',t.game_code,'event_status',t.status,'last_play_at',s.last_play_at,'total_score',s.total_score,'games_played',s.games_played,'event_seconds',s.total_seconds) order by b.username,t.game_code)
 from public.computer_players b join public.computer_player_scores s on s.bot_id=b.id join public.tournaments t on t.id=s.tournament_id where t.status in ('registration_open','running')),'[]'::jsonb);
end $$;
revoke all on function public.play80_owner_ai_activity() from public,anon;
grant execute on function public.play80_owner_ai_activity() to authenticated;
revoke all on function private.play80_open_next_tournament() from public,anon,authenticated;
revoke all on function private.play80_finalize_tournament(uuid) from public,anon,authenticated;
revoke all on function private.play80_tournament_tick() from public,anon,authenticated;
revoke all on function public.play80_memory_start(uuid) from public,anon;
grant execute on function public.play80_memory_start(uuid) to authenticated;
revoke all on function public.play80_tournament_join(uuid) from public,anon;
grant execute on function public.play80_tournament_join(uuid) to authenticated;
