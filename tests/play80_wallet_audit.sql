\set ON_ERROR_STOP on
create schema auth;
create schema private;
do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;end$$;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create table public.demo_wallets(user_id uuid primary key,balance bigint not null,held_balance bigint not null default 0,check(balance>=held_balance and held_balance>=0));
\i /work/supabase/migrations/20261128114500_wallet_balance_audit.sql
do $$
declare u uuid:='00000000-0000-4000-8000-000000000001';
declare v uuid:='00000000-0000-4000-8000-000000000002';
begin
 perform set_config('test.uid',u::text,true);
 insert into public.demo_wallets values(u,100,0),(v,0,0);
 update public.demo_wallets set held_balance=20 where user_id=u;
 update public.demo_wallets set balance=balance-20,held_balance=0 where user_id=u;
 update public.demo_wallets set balance=balance-10 where user_id=u;
 update public.demo_wallets set balance=balance+10 where user_id=v;
 update public.demo_wallets set balance=balance where user_id=v;
 assert (select count(*) from private.play80_wallet_balance_audit)=6;
 assert (select sum(new_balance-coalesce(old_balance,0)) from private.play80_wallet_balance_audit)=80;
 assert (select new_balance from private.play80_wallet_balance_audit where user_id=u order by id desc limit 1)=70;
 assert (select new_balance from private.play80_wallet_balance_audit where user_id=v order by id desc limit 1)=10;
 assert not has_table_privilege('authenticated','private.play80_wallet_balance_audit','INSERT');
 assert not has_table_privilege('authenticated','private.play80_wallet_balance_audit','SELECT');
 assert not has_function_privilege('anon','private.play80_audit_wallet_change()','EXECUTE');
 begin
   update public.demo_wallets set balance=-1 where user_id=u;
   raise exception 'invalid wallet update accepted' using errcode='XX000';
 exception when check_violation then null;end;
 assert (select count(*) from private.play80_wallet_balance_audit)=6;
end $$;
