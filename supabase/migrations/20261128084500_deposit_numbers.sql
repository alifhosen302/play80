create table public.play80_deposit_numbers(
 method text not null check(method in ('send','cashout')),
 provider text not null check(provider in ('bkash','nagad')),
 number text check(number ~ '^01[0-9]{9}$'),
 primary key(method,provider)
);
insert into public.play80_deposit_numbers(method,provider)
values ('send','bkash'),('send','nagad'),('cashout','bkash'),('cashout','nagad');
alter table public.play80_deposit_numbers enable row level security;
revoke all on public.play80_deposit_numbers from public,anon,authenticated;
grant select on public.play80_deposit_numbers to authenticated;
create policy deposit_numbers_read on public.play80_deposit_numbers for select to authenticated using(true);
create function public.play80_set_deposit_number(p_method text,p_provider text,p_number text,p_previous text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=auth.uid() and raw_app_meta_data->>'role'='owner') then
  raise exception 'শুধু ওনার নম্বর পরিবর্তন করতে পারবেন।' using errcode='42501';
 end if;
 if p_number is null or p_number !~ '^01[0-9]{9}$' then raise exception '১১ সংখ্যার মোবাইল নম্বর লিখুন।'; end if;
 update public.play80_deposit_numbers set number=p_number where method=p_method and provider=p_provider and number is not distinct from p_previous;
 if not found then raise exception 'নম্বর বদলে গেছে। আবার খুলে বর্তমান নম্বর দেখে সেভ করুন।'; end if;
end $$;
revoke all on function public.play80_set_deposit_number(text,text,text,text) from public,anon;
grant execute on function public.play80_set_deposit_number(text,text,text,text) to authenticated;
alter publication supabase_realtime add table public.play80_deposit_numbers;
