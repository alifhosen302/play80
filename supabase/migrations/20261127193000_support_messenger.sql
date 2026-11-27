-- Messenger-style support: automatic responses are stored server-side.
-- Preserve every existing conversation and keep automated replies separate
-- from the owner's human replies for inbox attention.
alter table public.play80_support_messages add column automatic_step text
  check (automatic_step in ('choose','deposit','withdraw','received'));
alter table public.play80_support_messages enable row level security;

create or replace view private.play80_support_threads as
select latest.user_id,latest.id as latest_id,latest.body as preview,latest.created_at as at,
  coalesce(state.unread,false) or
  (state.last_incoming is not null and (state.last_reply is null or state.last_incoming>=state.last_reply)) as needs_attention,
  state.message_count
from (select distinct on (user_id) user_id,id,body,created_at
  from public.play80_support_messages order by user_id,created_at desc,id desc) latest
join (select user_id,count(*) as message_count,
  bool_or(owner_read_at is null) filter(where sender_role='player') as unread,
  max(created_at) filter(where sender_role='player') as last_incoming,
  max(created_at) filter(where sender_role='owner' and automatic_step is null) as last_reply
  from public.play80_support_messages group by user_id) state using(user_id);
revoke all on private.play80_support_threads from public,anon,authenticated;

create or replace function public.play80_send_support_message(p_body text,p_category text default 'general')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();
declare v_id uuid;
declare v_owner uuid;
declare v_previous text;
declare v_step text;
declare v_reply text;
declare v_body text:=btrim(coalesce(p_body,''));
begin
  if v_uid is null or not exists(select 1 from auth.users u where u.id=v_uid
    and u.email_confirmed_at is not null and not u.is_anonymous
    and (u.banned_until is null or u.banned_until<=now())
    and coalesce(u.raw_app_meta_data->>'role','player') in ('player','dsr'))
    then raise exception 'Verified player login required'; end if;
  if coalesce(p_category,'') not in ('general','account_deletion') then raise exception 'Invalid category'; end if;
  if length(v_body) not between 1 and 1000 then raise exception 'Message length 1-1000'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,803));
  select automatic_step into v_previous from public.play80_support_messages
    where user_id=v_uid and sender_role='owner' order by created_at desc,id desc limit 1;
  insert into public.play80_support_messages(user_id,sender_id,sender_role,body,category,created_at)
    values(v_uid,v_uid,'player',v_body,p_category,clock_timestamp()) returning id into v_id;
  if p_category='general' then
    select id into v_owner from auth.users where raw_app_meta_data->>'role'='owner'
      and email_confirmed_at is not null and not is_anonymous
      and (banned_until is null or banned_until<=now()) order by id limit 1;
    if v_owner is not null then
      if lower(v_body) in ('হ্যালো','হাই','hello','hi','hey','সালাম','আসসালামু আলাইকুম') or v_previous is null then
        v_step:='choose';
        v_reply:='হ্যালো! আপনার কী সমস্যা? নিচের একটি অপশন বেছে নিন।';
      elsif v_body='ডিপোজিট সমস্যা' and v_previous in ('choose','received') then
        v_step:='deposit';
        v_reply:='ডেমো ডিপোজিট কখন ও কয়টায় করেছেন, কী মাধ্যম ব্যবহার করেছেন, ডেমো নাম বা রেফারেন্স নম্বর এবং পরিমাণ লিখে পাঠান। PIN, OTP বা বাস্তব পেমেন্ট তথ্য পাঠাবেন না।';
      elsif v_body='উইথড্র সমস্যা' and v_previous in ('choose','received') then
        v_step:='withdraw';
        v_reply:='ডেমো উইথড্র কখন ও কয়টায় করেছেন, কোন মাধ্যমে, কত ভার্চুয়াল কয়েন এবং ডেমো রেফারেন্স নম্বর লিখে পাঠান। PIN বা OTP পাঠাবেন না।';
      elsif v_previous in ('deposit','withdraw') then
        v_step:='received';
        v_reply:='আপনার তথ্য সংরক্ষণ হয়েছে। ওনার যাচাই করে এই কথোপকথনেই উত্তর দেবেন। অনুগ্রহ করে অপেক্ষা করুন।';
      elsif v_previous='choose' then
        v_step:='choose';
        v_reply:='আপনার মেসেজ পেয়েছি। ডিপোজিট বা উইথড্র সমস্যা বেছে নিতে পারেন; ওনারও আপনার মেসেজ দেখতে পাবেন।';
      end if;
      if v_step is not null then
        insert into public.play80_support_messages(user_id,sender_id,sender_role,body,category,automatic_step,created_at)
          values(v_uid,v_owner,'owner',v_reply,'general',v_step,clock_timestamp());
      end if;
    end if;
  end if;
  return jsonb_build_object('ok',true,'id',v_id);
end $$;
revoke all on function public.play80_send_support_message(text,text) from public,anon;
grant execute on function public.play80_send_support_message(text,text) to authenticated;

create or replace function public.play80_my_support_messages()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'category',m.category,'sender',m.sender_role,'at',m.created_at,'automatic_step',m.automatic_step) order by m.created_at desc,m.id desc)
    from public.play80_support_messages m where m.user_id=auth.uid()),'[]'::jsonb);
end $$;
revoke all on function public.play80_my_support_messages() from public,anon;
grant execute on function public.play80_my_support_messages() to authenticated;

create or replace function public.play80_owner_open_thread(p_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.play80_require_staff_read();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,803));
  update public.play80_support_messages set owner_read_at=now()
    where user_id=p_user and sender_role='player' and owner_read_at is null;
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at,t.id)
    from (select id,sender_role,body,category,created_at,automatic_step from public.play80_support_messages
      where user_id=p_user order by created_at desc,id desc limit 100) t),'[]'::jsonb);
end $$;
revoke all on function public.play80_owner_open_thread(uuid) from public,anon;
grant execute on function public.play80_owner_open_thread(uuid) to authenticated;
