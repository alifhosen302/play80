-- Non-redeemable virtual demo coins only. This does not confirm any real payment.
-- Preserve legacy pending credits and existing reserved withdrawal accounting.
alter table public.demo_wallet_requests add column instant_credited boolean not null default false;
alter table public.demo_wallets add column reversal_due bigint not null default 0 check(reversal_due>=0);
alter table public.demo_wallet_requests add constraint play80_instant_credit_kind check(not instant_credited or request_kind='demo_credit');
create unique index play80_instant_demo_reference_unique on public.demo_wallet_requests(lower(btrim(user_note))) where instant_credited;
create table private.play80_demo_reversal_events(
  id uuid primary key default gen_random_uuid(),user_id uuid not null,request_id uuid,
  amount bigint not null check(amount>0),event_kind text not null check(event_kind in ('assessed','recovered')),
  created_at timestamptz not null default clock_timestamp()
);
alter table private.play80_demo_reversal_events enable row level security;
revoke all on private.play80_demo_reversal_events from public,anon,authenticated;
create function private.play80_recover_demo_reversal() returns trigger
language plpgsql security definer set search_path='' as $$
declare recovered bigint;
begin
 recovered:=least(new.reversal_due,greatest(new.balance-new.held_balance,0));
 if recovered>0 then
   new.balance:=new.balance-recovered; new.reversal_due:=new.reversal_due-recovered;
   insert into private.play80_demo_reversal_events(user_id,amount,event_kind) values(new.user_id,recovered,'recovered');
   insert into public.demo_wallet_ledger(user_id,delta,balance_after,reason) values(new.user_id,-recovered,new.balance,'demo_adjustment');
 end if;
 return new;
end $$;
revoke all on function private.play80_recover_demo_reversal() from public,anon,authenticated;
create trigger play80_demo_reversal_recovery before update of balance,held_balance,reversal_due on public.demo_wallets
for each row execute function private.play80_recover_demo_reversal();
create function private.play80_reverse_instant_demo_credit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.instant_credited and old.status='pending' and new.status='rejected' then
   insert into private.play80_demo_reversal_events(user_id,request_id,amount,event_kind) values(new.user_id,new.id,new.amount,'assessed');
   update public.demo_wallets set reversal_due=reversal_due+new.amount,updated_at=now() where user_id=new.user_id;
   if not found then raise exception 'Wallet not found'; end if;
 end if;
 return new;
end $$;
revoke all on function private.play80_reverse_instant_demo_credit() from public,anon,authenticated;
create trigger play80_reverse_instant_demo_credit after update of status on public.demo_wallet_requests
for each row execute function private.play80_reverse_instant_demo_credit();
CREATE OR REPLACE FUNCTION public.submit_demo_wallet_request(p_kind text, p_amount bigint, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_wallet public.demo_wallets%rowtype;
  v_request uuid;
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;
  if p_kind not in ('demo_credit','demo_debit') then
    raise exception 'Invalid demo request kind';
  end if;
  if p_kind='demo_credit' and (p_amount < 100 or p_amount > 20000) then
    raise exception 'Demo credit must be between 100 and 20000 coins';
  end if;
  if p_kind='demo_debit' and (p_amount < 200 or p_amount > 1000000) then
    raise exception 'Demo removal must be between 200 and 1000000 coins';
  end if;
  if p_amount is null or p_note is not null and char_length(p_note)>300 then
    raise exception 'Invalid request details';
  end if;
  select * into v_wallet from public.demo_wallets where user_id=v_uid for update;
  if not found then raise exception 'User demo wallet not initialized'; end if;
  if (select count(*) from public.demo_wallet_requests where user_id=v_uid and status='pending') >= 5 then raise exception 'Too many pending requests'; end if;
  if p_kind='demo_debit' and (v_wallet.reversal_due>0 or exists(select 1 from public.demo_wallet_requests where user_id=v_uid and instant_credited and status='pending')) then raise exception 'PLAY80_UNVERIFIED_DEMO_CREDIT'; end if;
  if p_kind='demo_debit' and v_wallet.balance-v_wallet.held_balance < p_amount then
    raise exception 'Insufficient available demo coins';
  end if;

  insert into public.demo_wallet_requests(user_id,request_kind,amount,status,user_note)
  values(v_uid,p_kind,p_amount,'pending',nullif(btrim(p_note),''))
  returning id into v_request;
  if p_kind='demo_debit' then
    update public.demo_wallets set held_balance=held_balance+p_amount,updated_at=now()
    where user_id=v_uid;
  end if;
  return v_request;
end;
$function$;

CREATE OR REPLACE FUNCTION public.play80_submit_demo_credit(p_amount bigint, p_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();
declare v_reference text:=btrim(coalesce(p_reference,''));
declare v_request uuid;
declare v_balance bigint;
declare v_due bigint;
begin
  if v_uid is null or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=v_uid and u.email_confirmed_at is not null and not u.is_anonymous
    and (u.banned_until is null or u.banned_until<=now())
    and coalesce(u.raw_app_meta_data->>'role','player') in ('player','dsr')
    and nullif(btrim(p.username),'') is not null)
    then raise exception 'Verified player login required'; end if;
  if length(v_reference) not between 1 and 220 then raise exception 'Demo reference required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lower(v_reference),0));
  if exists(select 1 from public.demo_wallet_requests where request_kind='demo_credit' and lower(btrim(user_note))=lower('ডেমো ট্রান্সেকশন নম্বর: '||v_reference)) then raise exception 'Demo reference already used'; end if;
  v_request:=public.submit_demo_wallet_request('demo_credit',p_amount,'ডেমো ট্রান্সেকশন নম্বর: '||v_reference);
  update public.demo_wallet_requests set instant_credited=true where id=v_request;
  update public.demo_wallets set balance=balance+p_amount,updated_at=now() where user_id=v_uid returning balance-held_balance,reversal_due into v_balance,v_due;
  insert into public.demo_wallet_ledger(user_id,request_id,delta,balance_after,reason) select v_uid,v_request,p_amount,balance,'demo_adjustment' from public.demo_wallets where user_id=v_uid;
  return jsonb_build_object('ok',true,'request_id',v_request,'instant_credited',true,'available_balance',v_balance,'reversal_due',v_due);
end $function$;

CREATE OR REPLACE FUNCTION public.staff_review_demo_request(p_pin_token text, p_request_id uuid, p_decision text, p_review_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_req public.demo_wallet_requests%rowtype;
declare v_wallet public.demo_wallets%rowtype;
declare v_balance bigint;
begin
 perform private.check_staff_pin_token(p_pin_token);
 if p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
 if p_review_note is not null and length(p_review_note)>500 then raise exception 'Review note too long'; end if;
 if p_decision='rejected' and nullif(btrim(p_review_note),'') is null then
  raise exception 'Rejection requires a reason';
 end if;
 select * into v_req from public.demo_wallet_requests where id=p_request_id for update;
 if not found then raise exception 'Request not found'; end if;
 if v_req.status<>'pending' then raise exception 'Already reviewed'; end if;
 select * into v_wallet from public.demo_wallets where user_id=v_req.user_id for update;
 if not found then raise exception 'Wallet not found'; end if;
 v_balance:=v_wallet.balance;
 if p_decision='approved' then
   if v_req.request_kind='demo_credit' then
     if not v_req.instant_credited then
       update public.demo_wallets set balance=balance+v_req.amount,updated_at=now() where user_id=v_req.user_id returning balance into v_balance;
     end if;
   else
     if v_wallet.held_balance<v_req.amount then raise exception 'Reserved coins mismatch'; end if;
     update public.demo_wallets set balance=balance-v_req.amount,held_balance=held_balance-v_req.amount,
        updated_at=now() where user_id=v_req.user_id returning balance into v_balance;
   end if;
   if not v_req.instant_credited then
     insert into public.demo_wallet_ledger(user_id,request_id,delta,balance_after,reason)
     values(v_req.user_id,v_req.id,case when v_req.request_kind='demo_credit' then v_req.amount else -v_req.amount end,v_balance,'demo_request_approved');
   end if;
 elsif v_req.request_kind='demo_debit' then
   update public.demo_wallets set held_balance=held_balance-v_req.amount,updated_at=now()
     where user_id=v_req.user_id and held_balance>=v_req.amount
      returning balance into v_balance;
   if not found then raise exception 'Reserved coins mismatch'; end if;
 end if;
 update public.demo_wallet_requests
 set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(btrim(p_review_note),'')
 where id=p_request_id;
 insert into public.owner_audit_log(actor_id,action,object_type,object_id,details)
 values(auth.uid(),'staff_demo_wallet_review','demo_wallet_request',p_request_id,
 jsonb_build_object('decision',p_decision,'amount',v_req.amount,'kind',v_req.request_kind));
 select balance into v_balance from public.demo_wallets where user_id=v_req.user_id;
 return jsonb_build_object('ok',true,'status',p_decision,'balance_after',v_balance);
end;
$function$;
revoke all on function public.submit_demo_wallet_request(text,bigint,text) from public,anon,authenticated;
revoke all on function public.staff_review_demo_request(text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.play80_submit_demo_credit(bigint,text) from public,anon;
grant execute on function public.play80_submit_demo_credit(bigint,text) to authenticated;
