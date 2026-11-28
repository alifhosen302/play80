-- Free-play points only. Preserve account progress even after a loss exhausts the wallet.
create or replace function private.play80_close_zero_balance_turnover()
returns trigger language plpgsql security definer set search_path='' as $$
begin return new; end $$;

create or replace function private.play80_turnover_on_entry()
returns trigger language plpgsql security definer set search_path='' as $$
declare item record;
declare remaining_win bigint := new.delta;
declare applied bigint;
begin
  if new.transaction_type not in ('tournament_reward','bot_arena_win','demo_spin_win','demo_arcade_win') or remaining_win<=0 then return new; end if;
  -- A returned stake is not a win. Derive the profit from the paired server entry.
  if new.transaction_type in ('bot_arena_win','demo_spin_win','demo_arcade_win') then
    select greatest(0,new.delta+e.delta) into remaining_win
      from public.wallet_transactions e
      where e.user_id=new.user_id and e.operation_key=case new.transaction_type
        when 'bot_arena_win' then replace(new.operation_key,'bot-result:','bot-entry:')
        when 'demo_spin_win' then replace(new.operation_key,'demo-spin-result:','demo-spin-entry:')
        else replace(new.operation_key,'demo-arcade-result:','demo-arcade-entry:') end
      and e.delta<0;
    if coalesce(remaining_win,0)<=0 then return new; end if;
  end if;
  for item in
    select source,source_key,required-completed as remaining
    from private.play80_turnover_items where user_id=new.user_id and completed<required and voided_at is null
    order by created_at desc,source_key desc,source desc for update
  loop
    applied:=least(remaining_win,item.remaining);
    update private.play80_turnover_items set completed=completed+applied
    where source=item.source and source_key=item.source_key;
    remaining_win:=remaining_win-applied;
    exit when remaining_win=0;
  end loop;
  if remaining_win>0 then
  select least(remaining_win, required-completed) into applied
  from public.turnover_records where user_id=new.user_id and completed<required and closed_at is null for update;
  if found then
    update public.turnover_records set completed=completed+applied,updated_at=now()
    where user_id=new.user_id;
    remaining_win:=remaining_win-applied;

  end if;
  end if;
  return new;
end;
$$;


-- The client may select a game, stake and allowed choice, never a result.
create table private.play80_demo_arcade_rounds(
 user_id uuid not null references auth.users(id), round_id uuid not null,
 game text not null check(game in ('carnival','slots','roulette','plinko','keno')),
 stake bigint not null check(stake in (10,20,50)),
 choice jsonb not null, result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(user_id,round_id)
);
alter table private.play80_demo_arcade_rounds enable row level security;
revoke all on private.play80_demo_arcade_rounds from public,anon,authenticated;

create function private.play80_demo_uniform(p_limit integer) returns integer
language plpgsql volatile set search_path='' as $$
declare n integer;
begin
 if p_limit<1 or p_limit>256 then raise exception 'Invalid random bound'; end if;
 loop
  n:=get_byte(uuid_send(gen_random_uuid()),0);
  if n<256-(256%p_limit) then return n%p_limit; end if;
 end loop;
end $$;
revoke all on function private.play80_demo_uniform(integer) from public,anon,authenticated;

create function public.play80_demo_arcade(p_round_id uuid,p_game text,p_stake bigint,p_choice jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
declare r private.play80_demo_arcade_rounds%rowtype;
declare w public.demo_wallets%rowtype;
declare result jsonb; declare reward bigint:=0; declare ending_balance bigint;
declare idx integer; declare n integer; declare pos integer:=3;
declare a integer; declare b integer; declare c integer; declare hits integer;
declare chosen integer[]; declare drawn integer[]:='{}'; declare steps integer[]:='{}';
declare color text; declare requested_color text;
begin
 if u is null or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null and not is_anonymous
 and (banned_until is null or banned_until<=now()) and coalesce(raw_app_meta_data->>'role','player')='player') then
  raise exception 'Verified demo player login required';
 end if;
 if p_round_id is null or p_game is null or p_game not in ('carnival','slots','roulette','plinko','keno')
 or p_stake is null or (p_game='plinko' and p_stake not in (10,20,50)) or (p_game<>'plinko' and p_stake<>10)
 or p_choice is null or jsonb_typeof(p_choice)<>'object' then raise exception 'Invalid demo arcade round'; end if;
 select * into strict w from public.demo_wallets where user_id=u for update;
 select * into r from private.play80_demo_arcade_rounds where user_id=u and round_id=p_round_id;
 if found then
  if (r.game,r.stake,r.choice) is distinct from (p_game,p_stake,p_choice) then raise exception 'Round choice mismatch'; end if;
  return r.result;
 end if;
 if w.balance-w.held_balance<p_stake then raise exception 'পর্যাপ্ত ব্যবহারযোগ্য ডেমো কয়েন নেই।'; end if;
 if p_game='carnival' then
  idx:=private.play80_demo_uniform(8); reward:=(array[0,10,20,50,0,30,10,20])[idx+1];
  result:=jsonb_build_object('index',idx);
 elsif p_game='slots' then
  a:=private.play80_demo_uniform(7);b:=private.play80_demo_uniform(7);c:=private.play80_demo_uniform(7);
  reward:=case when a=b and b=c then case when a=6 then 150 else 60 end when a=b or b=c or a=c then 15 else 0 end;
  result:=jsonb_build_object('reels',array[a,b,c]);
 elsif p_game='roulette' then
  requested_color:=p_choice->>'color';
  if requested_color is null or requested_color not in ('red','black','green') then raise exception 'Invalid demo choice'; end if;
  n:=private.play80_demo_uniform(37);
  color:=case when n=0 then 'green' when n=any(array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]) then 'red' else 'black' end;
  reward:=case when color=requested_color then case when color='green' then 100 else 20 end else 0 end;
  result:=jsonb_build_object('number',n,'color',color);
 elsif p_game='plinko' then
  for i in 1..7 loop
   pos:=greatest(0,least(6,pos+case when private.play80_demo_uniform(2)=1 then 1 else -1 end));
   steps:=array_append(steps,pos);
  end loop;
  reward:=(array[5,3,2,0,2,3,5])[pos+1]*p_stake;
  result:=jsonb_build_object('steps',steps,'bin',pos);
 else
  if jsonb_typeof(p_choice->'numbers') is distinct from 'array' or jsonb_array_length(p_choice->'numbers')<>4 then raise exception 'Invalid demo choice'; end if;
  select array_agg(distinct value::integer) into chosen from jsonb_array_elements_text(p_choice->'numbers');
  if cardinality(chosen)<>4 or exists(select 1 from unnest(chosen) v where v<1 or v>20) then raise exception 'Invalid demo choice'; end if;
  while cardinality(drawn)<6 loop
   n:=1+private.play80_demo_uniform(20);
   if not n=any(drawn) then drawn:=array_append(drawn,n);end if;
  end loop;
  select count(*) into hits from unnest(chosen) v where v=any(drawn);
  reward:=(array[0,5,15,40,100])[hits+1];
  result:=jsonb_build_object('drawn',drawn,'hits',hits);
 end if;
 result:=result||jsonb_build_object('game',p_game,'stake',p_stake,'reward',reward,'net',reward-p_stake);
 insert into private.play80_demo_arcade_rounds values(u,p_round_id,p_game,p_stake,p_choice,result,now());
 update public.demo_wallets set balance=balance-p_stake+reward,updated_at=now() where user_id=u returning balance into ending_balance;
 insert into public.wallet_transactions(user_id,transaction_type,delta,balance_after,operation_key,description)
 values(u,'demo_arcade_entry',-p_stake,w.balance-p_stake,'demo-arcade-entry:'||u||':'||p_round_id,'Virtual practice round');
 if reward>0 then
  insert into public.wallet_transactions(user_id,transaction_type,delta,balance_after,operation_key,description)
  values(u,case when reward>p_stake then 'demo_arcade_win' else 'demo_arcade_return' end,reward,ending_balance,'demo-arcade-result:'||u||':'||p_round_id,'Virtual practice result');
 end if;
 return result;
end $$;
revoke all on function public.play80_demo_arcade(uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.play80_demo_arcade(uuid,text,bigint,jsonb) to authenticated;
