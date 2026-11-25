-- Optional six-digit PLAYER PIN after verified email/password login.
-- This is not a replacement for Supabase password authentication or the Owner's separate staff PIN.
create table if not exists private.play80_player_pins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 pin_hash text not null,
 failed_attempts integer not null default 0,
 locked_until timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
revoke all on private.play80_player_pins from anon,authenticated;

create or replace function public.play80_player_pin_status()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 return jsonb_build_object('configured',exists(select 1 from private.play80_player_pins where user_id=auth.uid()));
end $$;

create or replace function public.play80_set_player_pin(p_pin text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
  raise exception 'Verify email before setting PIN';
 end if;
 if p_pin is null or p_pin !~ '^[0-9]{6}$' then raise exception 'Six digits required'; end if;
 if exists(select 1 from private.play80_player_pins where user_id=auth.uid()) then
  raise exception 'PIN already configured. Contact Owner for a secure reset procedure';
 end if;
 insert into private.play80_player_pins(user_id,pin_hash)
 values(auth.uid(),extensions.crypt(p_pin,extensions.gen_salt('bf',10)));
 return jsonb_build_object('ok',true,'configured',true);
end $$;

create or replace function public.play80_verify_player_pin(p_pin text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v private.play80_player_pins%rowtype;
begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 select * into v from private.play80_player_pins where user_id=auth.uid() for update;
 if not found then return jsonb_build_object('ok',false,'message','Set your PIN first'); end if;
 if v.locked_until is not null and v.locked_until>now() then
  return jsonb_build_object('ok',false,'message','PIN temporarily locked');
 end if;
 if p_pin is null or v.pin_hash<>extensions.crypt(p_pin,v.pin_hash) then
  update private.play80_player_pins
  set failed_attempts=case when failed_attempts>=4 then 0 else failed_attempts+1 end,
      locked_until=case when failed_attempts>=4 then now()+interval '15 minutes' else null end,
      updated_at=now()
  where user_id=auth.uid();
  return jsonb_build_object('ok',false,'message','Incorrect PIN or temporarily locked');
 end if;
 update private.play80_player_pins set failed_attempts=0,locked_until=null,updated_at=now()
 where user_id=auth.uid();
 return jsonb_build_object('ok',true,'message','PIN verified');
end $$;
revoke all on function public.play80_player_pin_status(),public.play80_set_player_pin(text),public.play80_verify_player_pin(text) from public,anon;
grant execute on function public.play80_player_pin_status(),public.play80_set_player_pin(text),public.play80_verify_player_pin(text) to authenticated;
