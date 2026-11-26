create function public.play80_owner_wallet_page(p_pin_token text,p_kind text,p_view text,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rows jsonb; summary jsonb; available bigint;
begin
  perform private.check_staff_pin_token(p_pin_token);
  if p_kind is null or p_kind not in ('all','demo_credit','demo_debit') or p_view is null or p_view not in ('pending','history') then
    raise exception 'Invalid wallet filter';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb) into rows
  from (
    select r.id,r.user_id,r.request_kind,r.amount,r.status,r.user_note,r.review_note,r.created_at,r.reviewed_at,
      u.email,p.username
    from public.demo_wallet_requests r
    join auth.users u on u.id=r.user_id
    left join public.profiles p on p.id=r.user_id
    where (p_kind='all' or r.request_kind=p_kind) and
      ((p_view='pending' and r.status='pending') or (p_view='history' and r.status in ('approved','rejected')))
    order by r.created_at desc,r.id desc
    limit 31 offset greatest(coalesce(p_offset,0),0)
  ) x;
  select jsonb_build_object(
    'deposit_count',count(*) filter(where request_kind='demo_credit'),
    'withdraw_count',count(*) filter(where request_kind='demo_debit'),
    'deposit_amount',coalesce(sum(amount) filter(where request_kind='demo_credit'),0),
    'withdraw_amount',coalesce(sum(amount) filter(where request_kind='demo_debit'),0))
  into summary from public.demo_wallet_requests where status='pending';
  if private.staff_role(auth.uid())='owner' then
    select balance-held_balance into available from public.demo_wallets where user_id=auth.uid();
  end if;
  return jsonb_build_object('rows',rows,'summary',summary,'owner_available',available);
end $$;
revoke all on function public.play80_owner_wallet_page(text,text,text,integer) from public, anon;
grant execute on function public.play80_owner_wallet_page(text,text,text,integer) to authenticated;

create function private.play80_refill_owner_wallet(p_user uuid,p_floor bigint)
returns void language plpgsql security definer set search_path='' as $$
declare before_balance bigint; reserved bigint; refill_amount bigint;
begin
  if private.staff_role(p_user) is distinct from 'owner' then return; end if;
  select balance,held_balance into before_balance,reserved from public.demo_wallets where user_id=p_user for update;
  if not found or before_balance-reserved>p_floor then return; end if;
  refill_amount:=50000-(before_balance-reserved);
  if refill_amount<=0 then return; end if;
  update public.demo_wallets set balance=before_balance+refill_amount,updated_at=clock_timestamp() where user_id=p_user;
  insert into public.demo_wallet_ledger(user_id,delta,balance_after,reason,created_at)
  values(p_user,refill_amount,before_balance+refill_amount,'demo_adjustment',clock_timestamp());
end $$;
revoke all on function private.play80_refill_owner_wallet(uuid,bigint) from public, anon, authenticated;

create function private.play80_owner_wallet_refill_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.play80_refill_owner_wallet(new.user_id,30000);
  return null;
end $$;
revoke all on function private.play80_owner_wallet_refill_trigger() from public, anon, authenticated;

-- The existing wallet transaction writes its ledger entry first.
create constraint trigger play80_owner_wallet_refill
after insert or update on public.demo_wallets
deferrable initially deferred for each row
when (new.balance-new.held_balance<=30000)
execute function private.play80_owner_wallet_refill_trigger();

-- Initialize verified existing owners while retaining balances already above the target.
select private.play80_refill_owner_wallet(u.id,49999)
from auth.users u where u.raw_app_meta_data->>'role'='owner' and u.email_confirmed_at is not null;
