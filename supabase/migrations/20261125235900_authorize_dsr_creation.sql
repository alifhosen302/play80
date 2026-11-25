create or replace function public.play80_authorize_dsr_creation(p_pin_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.staff_role(auth.uid()) is distinct from 'owner' then
    raise exception 'Owner login required' using errcode = '42501';
  end if;
  perform private.check_staff_pin_token(p_pin_token);
  return true;
end;
$$;
revoke all on function public.play80_authorize_dsr_creation(text) from public, anon;
grant execute on function public.play80_authorize_dsr_creation(text) to authenticated;
