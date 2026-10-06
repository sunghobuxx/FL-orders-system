-- 적립금 함수 (결정 2026-10-06): 초과입금은 적립금으로, 상계는 사장님 버튼으로, 환불 가능. 앞으로 생기는 입금부터.
--
-- 1) record_receivable_payment: 미수금을 넘는 금액을 거절하지 않고 남는 만큼 적립금(overpay)으로 넣는다.
--    미수금이 아예 없어도 전액을 적립한다. 기존 OVERPAY / NO_RECEIVABLES 오류는 더 이상 나지 않는다.
-- 2) offset_restaurant_credit: 적립 잔액을 가장 오래된 미수금부터 상계한다(입금 함수와 같은 순서·같은 갱신).
-- 3) refund_restaurant_credit: 적립 잔액을 환불한다(원장에 음수로 기록). 실제 송금은 은행에서 따로 한다.
--
-- 잔액 = restaurant_credit_ledger 의 합계. 업체 행을 잠가서 같은 업체의 동시 처리가 서로 덮지 않게 한다.

create or replace function public.record_receivable_payment(
  p_restaurant_id       uuid,
  p_amount              numeric,
  p_method              text,
  p_paid_at             timestamptz,
  p_created_by          uuid default null,
  p_bank_transaction_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bt         public.bank_transactions%rowtype;
  v_total      numeric;
  v_remaining  numeric := p_amount;
  v_applied    numeric;
  v_new        numeric;
  v_updated    int := 0;
  v_statements uuid[] := '{}';
  v_stmt       uuid;
  r            record;
begin
  if p_amount is null or p_amount = 'NaN'::numeric or p_amount in ('Infinity'::numeric, '-Infinity'::numeric)
     or p_amount <= 0 or p_amount <> trunc(p_amount) then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_method is null or p_method not in ('transfer', 'cash', 'card') then
    raise exception 'INVALID_METHOD';
  end if;

  if p_bank_transaction_id is not null then
    select * into v_bt from public.bank_transactions where id = p_bank_transaction_id for update;
    if not found then
      raise exception 'BANK_TX_NOT_FOUND';
    end if;
    if v_bt.posted_at is not null then
      return jsonb_build_object('applied', 0, 'updated_count', 0, 'leftover', 0, 'credited', 0, 'already_posted', true);
    end if;
    if v_bt.direction <> 'in' or v_bt.amount <> p_amount then
      raise exception 'BANK_TX_MISMATCH';
    end if;
  end if;

  -- 미납 미수금을 잠그고 합계를 본다(잠금 순서는 채우는 순서와 같다).
  select coalesce(sum(balance), 0) into v_total
  from (
    select balance from public.receivables
    where restaurant_id = p_restaurant_id and status in ('unpaid', 'partial', 'overdue') and balance > 0
    order by due_date asc, created_at asc, id asc
    for update
  ) locked;

  for r in
    select id, balance, statement_id from public.receivables
    where restaurant_id = p_restaurant_id and status in ('unpaid', 'partial', 'overdue') and balance > 0
    order by due_date asc, created_at asc, id asc
    for update
  loop
    exit when v_remaining <= 0;
    v_applied := least(v_remaining, r.balance);
    v_new := r.balance - v_applied;

    insert into public.payments (target_type, target_id, amount, direction, method, paid_at, created_by, bank_transaction_id)
    values ('receivable', r.id, v_applied, 'inbound', p_method, p_paid_at, p_created_by, p_bank_transaction_id);

    update public.receivables
    set balance = v_new, status = case when v_new = 0 then 'paid' else 'partial' end
    where id = r.id;

    v_remaining := v_remaining - v_applied;
    v_updated := v_updated + 1;
    if r.statement_id is not null and not (r.statement_id = any (v_statements)) then
      v_statements := v_statements || r.statement_id;
    end if;
  end loop;

  foreach v_stmt in array v_statements loop
    update public.sales_statements
    set outstanding_amount = (select coalesce(sum(balance), 0) from public.receivables where statement_id = v_stmt)
    where id = v_stmt;
  end loop;

  -- 미수금을 넘고 남은 금액은 적립금으로 넣는다(2026-10-06 결정).
  if v_remaining > 0 then
    insert into public.restaurant_credit_ledger (restaurant_id, amount, kind, bank_transaction_id, note, created_by)
    values (p_restaurant_id, v_remaining, 'overpay', p_bank_transaction_id,
            '입금 초과분 자동 적립', p_created_by);
  end if;

  if p_bank_transaction_id is not null then
    update public.bank_transactions
    set posted_at = now(), posted_restaurant_id = p_restaurant_id, posted_by = p_created_by
    where id = p_bank_transaction_id;
  end if;

  return jsonb_build_object(
    'applied', p_amount - v_remaining,
    'updated_count', v_updated,
    'leftover', 0,
    'credited', v_remaining,
    'already_posted', false
  );
end;
$$;

revoke all on function public.record_receivable_payment(uuid, numeric, text, timestamptz, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_receivable_payment(uuid, numeric, text, timestamptz, uuid, uuid) to service_role;

create or replace function public.offset_restaurant_credit(
  p_restaurant_id uuid,
  p_amount        numeric,
  p_created_by    uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit     numeric;
  v_total      numeric;
  v_remaining  numeric := p_amount;
  v_applied    numeric;
  v_new        numeric;
  v_statements uuid[] := '{}';
  v_stmt       uuid;
  r            record;
begin
  if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) then
    raise exception 'INVALID_AMOUNT';
  end if;

  -- 업체 행을 잠가서 같은 업체의 상계·환불·입금이 동시에 잔액을 틀리지 않게 한다.
  perform 1 from public.restaurants where id = p_restaurant_id for update;
  if not found then
    raise exception 'RESTAURANT_NOT_FOUND';
  end if;

  select coalesce(sum(amount), 0) into v_credit from public.restaurant_credit_ledger where restaurant_id = p_restaurant_id;
  if p_amount > v_credit then
    raise exception 'INSUFFICIENT_CREDIT' using detail = trim_scale(v_credit)::text;
  end if;

  select coalesce(sum(balance), 0) into v_total
  from (
    select balance from public.receivables
    where restaurant_id = p_restaurant_id and status in ('unpaid', 'partial', 'overdue') and balance > 0
    order by due_date asc, created_at asc, id asc
    for update
  ) locked;
  if p_amount > v_total then
    raise exception 'OFFSET_EXCEEDS_RECEIVABLE' using detail = trim_scale(v_total)::text;
  end if;

  for r in
    select id, balance, statement_id from public.receivables
    where restaurant_id = p_restaurant_id and status in ('unpaid', 'partial', 'overdue') and balance > 0
    order by due_date asc, created_at asc, id asc
    for update
  loop
    exit when v_remaining <= 0;
    v_applied := least(v_remaining, r.balance);
    v_new := r.balance - v_applied;

    update public.receivables
    set balance = v_new, status = case when v_new = 0 then 'paid' else 'partial' end
    where id = r.id;

    v_remaining := v_remaining - v_applied;
    if r.statement_id is not null and not (r.statement_id = any (v_statements)) then
      v_statements := v_statements || r.statement_id;
    end if;
  end loop;

  foreach v_stmt in array v_statements loop
    update public.sales_statements
    set outstanding_amount = (select coalesce(sum(balance), 0) from public.receivables where statement_id = v_stmt)
    where id = v_stmt;
  end loop;

  insert into public.restaurant_credit_ledger (restaurant_id, amount, kind, note, created_by)
  values (p_restaurant_id, -p_amount, 'offset', '적립금 상계', p_created_by);

  return jsonb_build_object('offset', p_amount, 'credit_left', v_credit - p_amount, 'receivable_left', v_total - p_amount);
end;
$$;

revoke all on function public.offset_restaurant_credit(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.offset_restaurant_credit(uuid, numeric, uuid) to service_role;

create or replace function public.refund_restaurant_credit(
  p_restaurant_id uuid,
  p_amount        numeric,
  p_created_by    uuid default null,
  p_note          text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit numeric;
begin
  if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) then
    raise exception 'INVALID_AMOUNT';
  end if;

  perform 1 from public.restaurants where id = p_restaurant_id for update;
  if not found then
    raise exception 'RESTAURANT_NOT_FOUND';
  end if;

  select coalesce(sum(amount), 0) into v_credit from public.restaurant_credit_ledger where restaurant_id = p_restaurant_id;
  if p_amount > v_credit then
    raise exception 'INSUFFICIENT_CREDIT' using detail = trim_scale(v_credit)::text;
  end if;

  insert into public.restaurant_credit_ledger (restaurant_id, amount, kind, note, created_by)
  values (p_restaurant_id, -p_amount, 'refund', coalesce(p_note, '적립금 환불'), p_created_by);

  return jsonb_build_object('refunded', p_amount, 'credit_left', v_credit - p_amount);
end;
$$;

revoke all on function public.refund_restaurant_credit(uuid, numeric, uuid, text) from public, anon, authenticated;
grant execute on function public.refund_restaurant_credit(uuid, numeric, uuid, text) to service_role;
