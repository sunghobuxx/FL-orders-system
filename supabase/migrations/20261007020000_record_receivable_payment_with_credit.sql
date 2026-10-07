-- 초과입금을 적립금으로 넣는 별도 함수 (2026-10-07).
--
-- 2026-10-06 자동 적립 사고: 기본 입금 함수(record_receivable_payment)에 적립 로직을 넣었다가,
-- "확정" 버튼만 눌러도 조용히 큰 금액이 적립돼 버렸다(7건, 1,000만원+). record_receivable_payment 는
-- 그대로 "초과하면 거절"로 되돌렸다(20261007010000).
--
-- 적립은 이 별도 함수로만 한다. 「입금 확인」 화면에서 사람이 금액을 보고 "초과분 적립 처리" 를
-- 따로 눌렀을 때만 호출된다 — 기본 확정 버튼은 절대 이 함수를 부르지 않는다.
-- 본문은 record_receivable_payment 와 같고, 마지막에 남는 금액을 적립금으로 넣는 것만 다르다.

create or replace function public.record_receivable_payment_with_credit(
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

  if v_remaining > 0 then
    insert into public.restaurant_credit_ledger (restaurant_id, amount, kind, bank_transaction_id, note, created_by)
    values (p_restaurant_id, v_remaining, 'overpay', p_bank_transaction_id,
            '입금 확인 화면에서 초과분 적립 처리(사람이 선택)', p_created_by);
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

revoke all on function public.record_receivable_payment_with_credit(uuid, numeric, text, timestamptz, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_receivable_payment_with_credit(uuid, numeric, text, timestamptz, uuid, uuid) to service_role;
