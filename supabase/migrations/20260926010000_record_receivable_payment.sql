-- 입금 확정을 DB 함수 한 개로. 예전에는 record-payment 라우트가 미수금 조회 → payments insert →
-- receivables 갱신 → 정산서 미수금 갱신을 따로따로 호출했다. 중간에 실패하면 반쯤 반영되고,
-- 두 사람이 동시에 누르면 같은 미수금을 두 번 갚을 수 있었다. 여기서는 전부 한 트랜잭션이고,
-- 미수금·은행 거래 행을 잠근다(for update).
--
-- 규칙(그대로 옮긴 것):
--  * 미수금은 due_date 오름차순으로 채운다. 같은 날짜는 created_at, id 순(예전엔 정해져 있지 않았다).
--  * 미수금 합계보다 많으면 거절한다(OVERPAY). 조용히 버리지 않는다(2026-08-09).
--  * 다 갚으면 paid, 남으면 partial. 정산서(sales_statements.outstanding_amount)는 그 정산서 미수금 잔액 합계로 다시 맞춘다.
-- 추가된 것:
--  * created_by — 누가 입력했는지 기록한다(예전엔 293건 전부 비어 있었다).
--  * p_bank_transaction_id — 은행 거래로 확정할 때. 거래 행을 잠그고, 이미 반영됐으면 아무것도 바꾸지 않고
--    already_posted 를 돌려준다(재수집·더블클릭 방지). 거래 금액·방향이 다르면 거절한다.
--
-- 오류는 RAISE EXCEPTION 메시지로 구분한다: INVALID_AMOUNT / INVALID_METHOD / BANK_TX_NOT_FOUND /
-- BANK_TX_MISMATCH / NO_RECEIVABLES / OVERPAY(detail = 미수금 합계).

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
  if p_amount is null or p_amount <= 0 then
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
    where restaurant_id = p_restaurant_id and status in ('unpaid', 'partial', 'overdue')
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
    where restaurant_id = p_restaurant_id and status in ('unpaid', 'partial', 'overdue')
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
