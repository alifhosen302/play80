-- Append-only server wallet change audit. No existing wallet is modified or credited.
create table private.play80_wallet_balance_audit (
 id bigint generated always as identity primary key,
 user_id uuid not null,
 actor_id uuid,
 old_balance bigint,
 new_balance bigint not null,
 old_held bigint,
 new_held bigint not null,
 transaction_id bigint not null,
 recorded_at timestamptz not null default clock_timestamp(),
 check (new_balance>=0 and new_held>=0 and new_held<=new_balance)
);
alter table private.play80_wallet_balance_audit enable row level security;
revoke all on table private.play80_wallet_balance_audit from public,anon,authenticated;
create index play80_wallet_balance_audit_user_time on private.play80_wallet_balance_audit(user_id,recorded_at desc,id desc);
create function private.play80_audit_wallet_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
   insert into private.play80_wallet_balance_audit(user_id,actor_id,new_balance,new_held,transaction_id)
   values(new.user_id,auth.uid(),new.balance,new.held_balance,pg_catalog.txid_current());
 elsif (old.balance,old.held_balance) is distinct from (new.balance,new.held_balance) then
   insert into private.play80_wallet_balance_audit(user_id,actor_id,old_balance,new_balance,old_held,new_held,transaction_id)
   values(new.user_id,auth.uid(),old.balance,new.balance,old.held_balance,new.held_balance,pg_catalog.txid_current());
 end if;
 return new;
end $$;
revoke all on function private.play80_audit_wallet_change() from public,anon,authenticated;
create trigger play80_wallet_balance_audit after insert or update of balance,held_balance on public.demo_wallets
for each row execute function private.play80_audit_wallet_change();
