-- Payout terms must be configured explicitly before accepting a stake.
create table private.bot_arena_terms (
 singleton boolean primary key default true check(singleton),
 win_percent integer check(win_percent between 100 and 200),
 draw_refund boolean
);
insert into private.bot_arena_terms default values;
create table private.bot_arena_matches (
 id uuid primary key, player uuid not null references auth.users(id), game text not null check(game in ('ludo','chess')),
 stake integer not null check(stake in (50,100,150,200,300,500)), win_amount integer not null, draw_amount integer not null,
 revision integer not null default 0, status text not null check(status in ('active','won','lost','draw','forfeit')),
 state jsonb not null
);
-- A close may arrive before a start response during app shutdown.
create table private.bot_arena_closed_requests (id uuid primary key, player uuid not null);
create unique index bot_arena_one_active on private.bot_arena_matches(player) where status='active';

create function public.play80_bot_arena_store(p_player uuid,p_id uuid,p_action text,p_game text,p_stake integer,p_revision integer,p_status text,p_state jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m private.bot_arena_matches; terms private.bot_arena_terms; bal bigint; available bigint; amount integer;
begin
 select balance,balance-held_balance into strict bal,available from public.demo_wallets where user_id=p_player for update;
 select * into m from private.bot_arena_matches where id=p_id and player=p_player for update;
 if p_action='terms' then
  select * into strict terms from private.bot_arena_terms where singleton;
  return to_jsonb(terms)-'singleton';
 end if;
 if p_action='forfeit' and m.id is null then
  insert into private.bot_arena_closed_requests values(p_id,p_player) on conflict do nothing;
  return null;
 end if;
 if p_action='start' and m.id is null then
  select * into strict terms from private.bot_arena_terms where singleton;
  if terms.win_percent is null or terms.draw_refund is null then raise exception 'জয় ও ড্রয়ের বেট নীতি চালু হয়নি।'; end if;
  if exists(select 1 from private.bot_arena_closed_requests where id=p_id) then raise exception 'ম্যাচটি বন্ধ হয়েছে।'; end if;
  if (p_state->'quote') is distinct from (to_jsonb(terms)-'singleton') then raise exception 'বেটের শর্ত বদলেছে। আবার দেখে শুরু করো।'; end if;
  if available<p_stake then raise exception 'পর্যাপ্ত ব্যবহারযোগ্য কয়েন নেই।'; end if;
  insert into private.bot_arena_matches(id,player,game,stake,win_amount,draw_amount,status,state)
   values(p_id,p_player,p_game,p_stake,p_stake*terms.win_percent/100,case when terms.draw_refund then p_stake else 0 end,'active',p_state-'quote') returning * into m;
  update public.demo_wallets set balance=balance-p_stake,updated_at=now() where user_id=p_player returning balance into bal;
  insert into public.wallet_transactions(user_id,transaction_type,delta,balance_after,operation_key,description)
   values(p_player,'bot_arena_entry',-p_stake,bal,'bot-entry:'||p_id,'Computer match stake');
 elsif m.id is null then return null;
 elsif m.status='active' and (p_action='forfeit' or (p_action='advance' and m.revision=p_revision)) then
  update private.bot_arena_matches set revision=revision+1,status=case when p_action='forfeit' then 'forfeit' else p_status end,
   state=case when p_action='forfeit' then state else p_state end where id=m.id returning * into m;
  amount=case m.status when 'won' then m.win_amount when 'draw' then m.draw_amount else 0 end;
  if amount>0 then
   update public.demo_wallets set balance=balance+amount,updated_at=now() where user_id=p_player returning balance into bal;
   insert into public.wallet_transactions(user_id,transaction_type,delta,balance_after,operation_key,description)
    values(p_player,case when m.status='won' then 'bot_arena_win' else 'bot_arena_draw' end,amount,bal,'bot-result:'||p_id,'Computer match result');
  end if;
 end if;
 return to_jsonb(m)-'player';
end $$;
revoke all on function public.play80_bot_arena_store(uuid,uuid,text,text,integer,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.play80_bot_arena_store(uuid,uuid,text,text,integer,integer,text,jsonb) to service_role;
