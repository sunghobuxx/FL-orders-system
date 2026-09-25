-- record_receivable_payment 금액 가드 보강 (최종 리뷰 Important 지적, 2026-09-26).
-- 20260926010000 의 함수를 다시 정의한다. 바뀐 것은 두 가지뿐이다.
--  1) 금액은 원 단위 정수만 — NaN·Infinity·소수는 INVALID_AMOUNT.
--  2) 잔액이 0 이하인 미수금은 입금 대상에서 뺀다(status 가 unpaid 로 남은 이상 데이터가 있어도 입금이 막히지 않게).
-- 나머지 규칙은 20260926010000 과 같다.

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
  v_count      int;
  v_remaining  numeric := p_amount;
  v_applied    numeric;
  v_new        numeric;
  v_updated    int := 0;
  v_statements uuid[] := '{}';
  v_stmt       uuid;
  r            record;
begin
  -- 원 단위 정수만 받는다. NaN·Infinity·소수는 거절한다: numeric(14,2) 컬럼에 반올림되어 들어가
  -- 입금 합계와 잔액이 어긋나고, 잔액이 0.00 인데 partial 로 남은 미수금이 생기면 그 업체의 이후
  -- 입금이 전부 payments_amount_check 위반(500)으로 막힌다(2026-09-26 리뷰).
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
      return jsonb_build_object('applied', 0, 'updated_count', 0, 'leftover', 0, 'already_posted', true);
    end if;
    if v_bt.direction <> 'in' or v_bt.amount <> p_amount then
      raise exception 'BANK_TX_MISMATCH';
    end if;
  end if;

  -- 미납 미수금을 잠그고 합계를 본다. 잠금 순서는 채우는 순서와 같다.
  select coalesce(sum(balance), 0), count(*) into v_total, v_count
  from (
    select balance from public.receivables
    where restaurant_id = p_restaurant_id and status in ('unpaid', 'partial', 'overdue') and balance > 0
    order by due_date asc, created_at asc, id asc
    for update
  ) locked;

  if v_count = 0 then
    raise exception 'NO_RECEIVABLES';
  end if;
  if p_amount > v_total then
    raise exception 'OVERPAY' using detail = trim_scale(v_total)::text;
  end if;

  for r in
    select id, balance, statement_id from public.receivables
    where restaurant_id = p_restaurant_id and status in ('unpaid', 'partial', 'overdue') and balance > 0
    order by due_date asc, created_at asc, id asc
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

  if p_bank_transaction_id is not null then
    update public.bank_transactions
    set posted_at = now(), posted_restaurant_id = p_restaurant_id, posted_by = p_created_by
    where id = p_bank_transaction_id;
  end if;

  return jsonb_build_object('applied', p_amount - v_remaining, 'updated_count', v_updated, 'leftover', v_remaining, 'already_posted', false);
end;
$$;

revoke all on function public.record_receivable_payment(uuid, numeric, text, timestamptz, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_receivable_payment(uuid, numeric, text, timestamptz, uuid, uuid) to service_role;
