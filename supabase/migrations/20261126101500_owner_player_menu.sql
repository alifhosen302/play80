alter table public.play80_support_messages add column if not exists owner_read_at timestamptz;

create or replace function public.play80_menu_counts()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare staff text := private.staff_role(auth.uid());
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  return jsonb_build_object(
    'requests', case when staff in ('owner','admin') then
      (select count(*) from public.demo_wallet_requests where status='pending') else 0 end,
    'support', case when staff='owner' then
      (select count(*) from public.play80_support_messages where sender_role='player' and owner_read_at is null) else 0 end
  );
end $$;

create or replace function public.play80_mark_support_read(p_pin_token text, p_message uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.staff_role(auth.uid()) is distinct from 'owner' then
    raise exception 'Owner access required';
  end if;
  perform private.check_staff_pin_token(p_pin_token);
  update public.play80_support_messages set owner_read_at=now()
  where id=p_message and sender_role='player' and owner_read_at is null;
end $$;

revoke all on function public.play80_menu_counts() from public, anon;
revoke all on function public.play80_mark_support_read(text,uuid) from public, anon;
grant execute on function public.play80_menu_counts() to authenticated;
grant execute on function public.play80_mark_support_read(text,uuid) to authenticated;

create or replace function public.play80_owner_support_messages(p_pin_token text,p_search text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.check_staff_pin_token(p_pin_token);
 if private.staff_role(auth.uid()) is distinct from 'owner' then raise exception 'Owner access required'; end if;
 return coalesce((select jsonb_agg(row_to_json(t) order by (t.sender_role='player' and t.owner_read_at is null) desc,t.created_at desc)
 from (select m.id,m.user_id,m.sender_role,m.category,m.body,m.created_at,m.owner_read_at,p.username,u.email
 from public.play80_support_messages m
 join auth.users u on u.id=m.user_id left join public.profiles p on p.id=m.user_id
 where nullif(btrim(p_search),'') is null
 or u.id::text ilike '%'||btrim(p_search)||'%'
 or u.email ilike '%'||btrim(p_search)||'%'
 or p.username ilike '%'||btrim(p_search)||'%'
 order by (m.sender_role='player' and m.owner_read_at is null) desc, m.created_at desc limit 100)t),'[]'::jsonb);
end $$;

-- PLAY80 V4.3 account-owner privilege hardening.
CREATE OR REPLACE FUNCTION public.play80_staff_user_page(p_pin_token text, p_search text DEFAULT ''::text, p_offset integer DEFAULT 0)
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
      or p.display_name ilike '%'||btrim(p_search)||'%'
      or p.username ilike '%'||btrim(p_search)||'%'
      or u.id::text ilike '%'||btrim(p_search)||'%'
   order by u.created_at desc, u.id desc
   limit 51 offset greatest(coalesce(p_offset,0),0)
 ) x;
 return v_data;
end;
$function$;

revoke all on function public.play80_staff_user_page(text,text,integer) from public, anon;
grant execute on function public.play80_staff_user_page(text,text,integer) to authenticated;
