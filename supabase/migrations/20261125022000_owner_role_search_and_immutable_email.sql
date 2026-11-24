-- PLAY80 V4.3 account-owner privilege hardening.
CREATE OR REPLACE FUNCTION public.staff_list_users(p_pin_token text, p_search text DEFAULT ''::text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_data jsonb;
begin
 perform private.check_staff_pin_token(p_pin_token);
 select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) into v_data
 from (
   select u.id, u.email, p.username,p.display_name,
       coalesce(w.balance,0) as balance,coalesce(w.held_balance,0) as held_balance,
       coalesce(u.raw_app_meta_data->>'role','player') as role,
       u.created_at,u.email_confirmed_at is not null as email_verified,
       (u.banned_until is not null and u.banned_until>now()) as suspended
   from auth.users u
   left join public.profiles p on p.id=u.id
   left join public.demo_wallets w on w.user_id=u.id
   where nullif(btrim(p_search),'') is null
      or u.email ilike '%'||btrim(p_search)||'%'
      or p.username ilike '%'||btrim(p_search)||'%'
      or u.id::text ilike '%'||btrim(p_search)||'%'
   order by u.created_at desc
   limit least(greatest(coalesce(p_limit,50),1),100)
 ) x;
 return v_data;
end;
$function$

CREATE OR REPLACE FUNCTION public.staff_send_demo_coins(p_pin_token text, p_target_user uuid, p_amount bigint, p_operation_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_balance bigint;
begin
 perform private.check_staff_pin_token(p_pin_token);
 if private.staff_role(auth.uid())<>'owner' then raise exception 'Only the Owner can issue demo coins'; end if;
 if p_target_user=auth.uid() then raise exception 'Owner cannot grant to own account'; end if;
 if p_amount is null or p_amount<1 or p_amount>1000000 then
   raise exception 'Send between 1 and 1,000,000 demo coins at once';
 end if;
 if p_operation_id is null then raise exception 'Unique operation ID required'; end if;
 if p_note is not null and char_length(p_note)>200 then
  raise exception 'Note is too long';
 end if;
 if not exists(select 1 from auth.users where id=p_target_user and email_confirmed_at is not null) then
  raise exception 'Destination account not verified';
 end if;
 insert into private.staff_coin_transfer_keys(operation_id,actor_id,target_user_id,amount)
 values(p_operation_id,auth.uid(),p_target_user,p_amount)
 on conflict do nothing;
 if not found then
  return jsonb_build_object('ok',true,'duplicate',true,'message','This operation was already processed');
 end if;
 update public.demo_wallets set balance=balance+p_amount,updated_at=now()
 where user_id=p_target_user returning balance into v_balance;
 if not found then raise exception 'Target demo wallet was not initialized'; end if;
 insert into public.demo_wallet_ledger(user_id,delta,balance_after,reason)
 values(p_target_user,p_amount,v_balance,'demo_adjustment');
 insert into public.owner_audit_log(actor_id,action,object_type,object_id,details)
 values(auth.uid(),'send_demo_coins','user',p_target_user,
    jsonb_build_object('demo_amount',p_amount,'note',left(coalesce(p_note,''),200),
      'operation_id',p_operation_id));
 return jsonb_build_object('ok',true,'duplicate',false,'balance_after',v_balance);
end;
$function$


create or replace function private.play80_immutable_email()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.email is distinct from old.email then raise exception 'Registered email cannot be changed'; end if;
 return new;
end $$;
drop trigger if exists play80_immutable_email_guard on auth.users;
create trigger play80_immutable_email_guard before update of email on auth.users
for each row execute function private.play80_immutable_email();
