-- Audited owner demo grant also delivers a user-visible inbox message.
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
 insert into public.play80_support_messages(user_id,sender_id,sender_role,body,category)
 values(p_target_user,auth.uid(),'owner',
 'Owner sent '||p_amount||' DEMO Coins. Note: '||left(coalesce(p_note,'Owner manual grant'),200),'coin_adjustment');
 return jsonb_build_object('ok',true,'duplicate',false,'balance_after',v_balance);
end;
$function$;
