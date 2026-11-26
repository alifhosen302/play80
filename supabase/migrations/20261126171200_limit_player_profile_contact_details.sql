CREATE OR REPLACE FUNCTION public.play80_staff_user_page(p_pin_token text, p_search text DEFAULT ''::text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_data jsonb;
begin
 perform private.play80_require_staff_read();
 select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) into v_data
 from (
   select u.id, u.email, p.username,p.display_name,
       case when private.staff_role(auth.uid())='owner' then p.full_name end as full_name,
       case when private.staff_role(auth.uid())='owner' then p.phone_number end as phone_number,
       case when private.staff_role(auth.uid())='owner' then p.address_text end as address_text,
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
