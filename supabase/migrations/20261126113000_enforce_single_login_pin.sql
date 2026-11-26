create or replace function public.play80_authorize_dsr_creation(p_pin_token text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if private.staff_role(auth.uid()) is distinct from 'owner' then raise exception 'Owner login required'; end if;
  delete from private.staff_pin_sessions where user_id=auth.uid()
    and token_hash=encode(extensions.digest(p_pin_token,'sha256'),'hex') and login_scope='dsr' and expires_at>now();
  return found;
end $$;

revoke execute on function
  public.staff_review_demo_request(text,uuid,text,text),
  public.staff_send_demo_coins(text,uuid,bigint,uuid,text),
  public.staff_manage_admin(text,uuid,text),
  public.play80_owner_bot_upsert(text,uuid,text,text,text,boolean),
  public.play80_owner_send_message(text,uuid,text),
  public.play80_owner_reclaim_coins(text,uuid,bigint,text,uuid),
  public.play80_owner_account_control(text,uuid,text,text),
  public.staff_set_pin(text), public.staff_change_pin(text,text), public.staff_unlock_pin(text),
  public.submit_demo_wallet_request(text,bigint,text)
from public, anon, authenticated;
