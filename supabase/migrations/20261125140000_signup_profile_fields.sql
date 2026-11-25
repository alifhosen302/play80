-- PLAY80 V4.7 requested registration fields; existing users preserved.
alter table public.profiles add column if not exists phone_number text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists address_text text;
create or replace function private.create_play80_user_data()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_username text:=lower(btrim(coalesce(new.raw_user_meta_data->>'username','')));
declare v_phone text:=btrim(coalesce(new.raw_user_meta_data->>'phone_number',''));
declare v_full text:=btrim(coalesce(new.raw_user_meta_data->>'full_name',''));
declare v_address text:=btrim(coalesce(new.raw_user_meta_data->>'address',''));
begin
 if v_username !~ '^[a-z0-9_]{3,24}$' then raise exception 'Username must use 3-24 English letters, numbers or underscore'; end if;
 if v_phone !~ '^[+]?[0-9]{10,15}$' then raise exception 'Invalid phone number'; end if;
 if length(v_full) not between 3 and 100 then raise exception 'Full name required (3-100 characters)'; end if;
 if length(v_address) not between 8 and 250 then raise exception 'Address required (8-250 characters)'; end if;
 insert into public.profiles(id,username,display_name,phone_number,full_name,address_text)
 values(new.id,v_username,left(v_full,80),v_phone,v_full,v_address)
 on conflict(id) do nothing;
 insert into public.demo_wallets(user_id) values(new.id) on conflict(user_id) do nothing;
 return new;
end $$;
-- The preexisting unique lower(username) constraint and permanent username reservation remain in effect.
