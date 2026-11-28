-- Server-authoritative non-redeemable free-play demo points only.
-- Never accept a client-supplied outcome, reward, or wallet balance.
create table private.play80_demo_spin_rounds(
 user_id uuid not null references auth.users(id), round_id uuid not null,
 stake bigint not null check(stake in (1,5,50,1000)),
 sector integer not null check(sector between 0 and 9),
 reward bigint not null check(reward>=0),
 created_at timestamptz not null default now(),
 primary key(user_id,round_id)
);
alter table private.play80_demo_spin_rounds enable row level security;
revoke all on private.play80_demo_spin_rounds from public,anon,authenticated;

create or replace function private.play80_turnover_on_entry()
returns trigger language plpgsql security definer set search_path='' as $$
declare item record;
declare remaining_win bigint := new.delta;
declare applied bigint;
begin
  if new.transaction_type not in ('tournament_reward','bot_arena_win','demo_spin_win') or remaining_win<=0 then return new; end if;
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

-- The credited reward of a verified win advances turnover; a loss or returned stake does not.
create function public.play80_demo_spin(p_round_id uuid,p_stake bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
declare r private.play80_demo_spin_rounds%rowtype;
declare w public.demo_wallets%rowtype;
declare sample integer; declare idx integer; declare payout bigint; declare ending_balance bigint;
begin
 if u is null or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null and not is_anonymous
  and (banned_until is null or banned_until<=now()) and coalesce(raw_app_meta_data->>'role','player') in ('player','dsr')) then
   raise exception 'Verified demo player login required';
 end if;
 if p_round_id is null or p_stake is null or p_stake not in (1,5,50,1000) then raise exception 'Invalid demo spin'; end if;
 select * into strict w from public.demo_wallets where user_id=u for update;
 select * into r from private.play80_demo_spin_rounds where user_id=u and round_id=p_round_id;
 if found then
   if r.stake<>p_stake then raise exception 'Round stake mismatch'; end if;
   return jsonb_build_object('sector',r.sector,'reward',r.reward,'stake',r.stake,'balance',w.balance-w.held_balance);
 end if;
 if w.balance-w.held_balance<p_stake then raise exception 'পর্যাপ্ত ব্যবহারযোগ্য ডেমো কয়েন নেই।'; end if;
 -- PostgreSQL generates a cryptographically random UUID; rejection sampling
 -- avoids modulo bias without needing any extension.
 loop
   sample:=get_byte(uuid_send(gen_random_uuid()),0);
   exit when sample<250;
 end loop;
 idx:=sample%10;
 payout:=(array[0,5,1,0,5,1,0,5,1,0])[idx+1]*p_stake;
 insert into private.play80_demo_spin_rounds(user_id,round_id,stake,sector,reward) values(u,p_round_id,p_stake,idx,payout);
 -- One balance update prevents a temporary zero balance from closing turnover on a winning round.
 update public.demo_wallets set balance=balance-p_stake+payout,updated_at=now() where user_id=u returning balance into ending_balance;
 insert into public.wallet_transactions(user_id,transaction_type,delta,balance_after,operation_key,description)
 values(u,'demo_spin_entry',-p_stake,w.balance-p_stake,'demo-spin-entry:'||u||':'||p_round_id,'Virtual demo spin stake');
 if payout>0 then
   insert into public.wallet_transactions(user_id,transaction_type,delta,balance_after,operation_key,description)
   values(u,case when payout>p_stake then 'demo_spin_win' else 'demo_spin_return' end,payout,ending_balance,'demo-spin-result:'||u||':'||p_round_id,'Virtual demo spin result');
 end if;
 return jsonb_build_object('sector',idx,'reward',payout,'stake',p_stake,'balance',ending_balance-w.held_balance);
end $$;
revoke all on function public.play80_demo_spin(uuid,bigint) from public,anon,authenticated;
grant execute on function public.play80_demo_spin(uuid,bigint) to authenticated;
