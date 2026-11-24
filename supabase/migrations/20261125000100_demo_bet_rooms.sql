-- PLAY80: demo-only online room matching. No wallet debit, commission collection or payout.
-- In this first phase stakes are matching preferences ONLY. Gameplay is not yet server-authoritative.
create table if not exists public.bet_rooms (
 id uuid primary key default gen_random_uuid(),
 game_code text not null check(game_code in ('ludo','chess')),
 demo_stake integer not null check(demo_stake in (50,100,150,500,1000)),
 max_players integer not null check(max_players between 2 and 4),
 private_room boolean not null default false,
 invite_code text not null unique default upper(substr(encode(gen_random_bytes(8),'hex'),1,10)),
 status text not null default 'waiting' check(status in ('waiting','ready','cancelled')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint chess_two_players check(game_code!='chess' or max_players=2)
);
create index if not exists bet_rooms_queue on public.bet_rooms(game_code,demo_stake,max_players,created_at) where status='waiting' and private_room=false;
create table if not exists public.bet_room_players (
 room_id uuid not null references public.bet_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 seat integer not null check(seat between 1 and 4),
 joined_at timestamptz not null default now(),
 primary key(room_id,user_id),
 unique(room_id,seat)
);
create index if not exists bet_room_players_user on public.bet_room_players(user_id);
alter table public.bet_rooms enable row level security;
alter table public.bet_room_players enable row level security;
revoke all on public.bet_rooms,public.bet_room_players from anon,authenticated;
-- Room details are read exclusively using authenticated, member-checked functions.
create or replace function public.play80_bet_room_info(p_room uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid(); v_room public.bet_rooms%rowtype; v_members jsonb;
begin
 if v_uid is null then raise exception 'Sign in required'; end if;
 if not exists(select 1 from public.bet_room_players p where p.room_id=p_room and p.user_id=v_uid) then raise exception 'Not a participant'; end if;
 select * into v_room from public.bet_rooms where id=p_room;
 if not found then raise exception 'Room not found'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('seat',p.seat,'username',coalesce(pr.display_name,pr.username,'Player'),'self',p.user_id=v_uid) order by p.seat),'[]'::jsonb) into v_members from public.bet_room_players p left join public.profiles pr on pr.id=p.user_id where p.room_id=p_room;
 return jsonb_build_object('id',v_room.id,'game',v_room.game_code,'stake',v_room.demo_stake,'max_players',v_room.max_players,'status',v_room.status,'private',v_room.private_room,'invite_code',v_room.invite_code,'players',v_members,'virtual_fee_each',v_room.demo_stake/10,'virtual_winner_prize',v_room.max_players*(v_room.demo_stake-v_room.demo_stake/10),'settlement_enabled',false);
end $$;
create or replace function public.play80_bet_find_or_create(p_game text,p_stake integer,p_players integer,p_private boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_room public.bet_rooms%rowtype; v_seat integer;
begin
 if v_uid is null then raise exception 'Sign in required'; end if;
 if p_game not in ('ludo','chess') or p_stake not in (50,100,150,500,1000) or p_players not between 2 and 4 or (p_game='chess' and p_players<>2) then raise exception 'Invalid match selection'; end if;
 -- This is demo matchmaking, not a wallet transaction. Balance is checked again when real settlement is implemented.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('play80:bet:'||p_game||':'||p_stake||':'||p_players||':'||p_private));
 select r.id into v_id from public.bet_rooms r join public.bet_room_players p on p.room_id=r.id where p.user_id=v_uid and r.status in ('waiting','ready') order by r.created_at desc limit 1;
 if v_id is not null then return public.play80_bet_room_info(v_id); end if;
 if not coalesce(p_private,false) then
  select r.id into v_id from public.bet_rooms r
  where r.game_code=p_game and r.demo_stake=p_stake and r.max_players=p_players and r.status='waiting' and not r.private_room
    and (select count(*) from public.bet_room_players p where p.room_id=r.id) < r.max_players
  order by r.created_at limit 1 for update skip locked;
 end if;
 if v_id is null then
  insert into public.bet_rooms(game_code,demo_stake,max_players,private_room,created_by)
  values(p_game,p_stake,p_players,coalesce(p_private,false),v_uid) returning id into v_id;
 end if;
 select coalesce(max(seat),0)+1 into v_seat from public.bet_room_players where room_id=v_id;
 insert into public.bet_room_players(room_id,user_id,seat) values(v_id,v_uid,v_seat);
 update public.bet_rooms set status=case when v_seat>=max_players then 'ready' else 'waiting' end,updated_at=now() where id=v_id;
 return public.play80_bet_room_info(v_id);
end $$;
create or replace function public.play80_bet_join_invite(p_invite text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid(); v_room public.bet_rooms%rowtype; v_seat integer;
begin
 if v_uid is null then raise exception 'Sign in required'; end if;
 if length(trim(coalesce(p_invite,'')))<>10 then raise exception 'Invalid invitation code'; end if;
 select * into v_room from public.bet_rooms where invite_code=upper(trim(p_invite)) and status='waiting' for update;
 if not found then raise exception 'Invitation unavailable or room already full'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('play80:invite:'||v_room.id::text));
 if exists(select 1 from public.bet_room_players where room_id=v_room.id and user_id=v_uid) then return public.play80_bet_room_info(v_room.id); end if;
 if exists(select 1 from public.bet_room_players p join public.bet_rooms r on r.id=p.room_id where p.user_id=v_uid and r.status in ('waiting','ready')) then raise exception 'Leave your previous room first'; end if;
 select coalesce(max(seat),0)+1 into v_seat from public.bet_room_players where room_id=v_room.id;
 if v_seat>v_room.max_players then raise exception 'Room full'; end if;
 insert into public.bet_room_players(room_id,user_id,seat) values(v_room.id,v_uid,v_seat);
 update public.bet_rooms set status=case when v_seat>=max_players then 'ready' else 'waiting' end,updated_at=now() where id=v_room.id;
 return public.play80_bet_room_info(v_room.id);
end $$;
create or replace function public.play80_bet_leave_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid(); v_room public.bet_rooms%rowtype; v_count integer;
begin
 if v_uid is null then raise exception 'Sign in required'; end if;
 select * into v_room from public.bet_rooms where id=p_room for update;
 if not found or v_room.status<>'waiting' then raise exception 'Only waiting rooms can be left'; end if;
 delete from public.bet_room_players where room_id=p_room and user_id=v_uid;
 if not found then raise exception 'Not in this room'; end if;
 select count(*) into v_count from public.bet_room_players where room_id=p_room;
 if v_count=0 then update public.bet_rooms set status='cancelled',updated_at=now() where id=p_room; end if;
 return jsonb_build_object('left',true);
end $$;
create or replace function public.play80_bet_available(p_game text,p_players integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid(); v_stakes jsonb;
begin
 if v_uid is null then raise exception 'Sign in required'; end if;
 if p_game not in ('ludo','chess') or p_players not between 2 and 4 or (p_game='chess' and p_players<>2) then raise exception 'Invalid game'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('stake',q.demo_stake,'waiting_players',q.queued) order by q.queued desc,q.demo_stake),'[]'::jsonb) into v_stakes
 from (select r.demo_stake, sum((select count(*) from public.bet_room_players p where p.room_id=r.id)) queued from public.bet_rooms r where r.game_code=p_game and r.max_players=p_players and r.status='waiting' and not r.private_room group by r.demo_stake) q;
 return jsonb_build_object('available',v_stakes,'suggested_stake',coalesce((select r.demo_stake from public.bet_rooms r where r.game_code=p_game and r.max_players=p_players and r.status='waiting' and not r.private_room order by r.created_at limit 1),null));
end $$;
revoke all on function public.play80_bet_room_info(uuid),public.play80_bet_find_or_create(text,integer,integer,boolean),public.play80_bet_join_invite(text),public.play80_bet_leave_room(uuid),public.play80_bet_available(text,integer) from public,anon;
grant execute on function public.play80_bet_room_info(uuid),public.play80_bet_find_or_create(text,integer,integer,boolean),public.play80_bet_join_invite(text),public.play80_bet_leave_room(uuid),public.play80_bet_available(text,integer) to authenticated;
