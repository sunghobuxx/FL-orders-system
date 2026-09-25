-- record_receivable_payment 검증. 실행: execute_sql 로 통째로. 통과하면 마지막 select 가 한 줄 나온다.
begin;

do $$
declare
  org uuid; rest uuid; org2 uuid; rest2 uuid;
  per1 uuid; per2 uuid; st1 uuid; st2 uuid; r1 uuid; r2 uuid;
  res jsonb; bt uuid; n int; b numeric; s text; o numeric;
  org3 uuid; rest3 uuid; per3 uuid; st3 uuid;
begin
  insert into organizations(organization_type, name) values ('restaurant', '__test_rp__') returning id into org;
  insert into restaurants(organization_id) values (org) returning id into rest;
  insert into organizations(organization_type, name) values ('restaurant', '__test_rp2__') returning id into org2;
  insert into restaurants(organization_id) values (org2) returning id into rest2;

  insert into settlement_periods(period_type, start_date, end_date) values ('weekly', '2001-01-01', '2001-01-07') returning id into per1;
  insert into settlement_periods(period_type, start_date, end_date) values ('weekly', '2001-01-08', '2001-01-14') returning id into per2;
  insert into sales_statements(restaurant_id, settlement_period_id, total_amount, outstanding_amount) values (rest, per1, 100000, 100000) returning id into st1;
  insert into sales_statements(restaurant_id, settlement_period_id, total_amount, outstanding_amount) values (rest, per2,  50000,  50000) returning id into st2;
  insert into receivables(restaurant_id, statement_id, due_date, balance, status) values (rest, st1, '2001-01-10', 100000, 'unpaid') returning id into r1;
  insert into receivables(restaurant_id, statement_id, due_date, balance, status) values (rest, st2, '2001-01-20',  50000, 'unpaid') returning id into r2;

  -- A) 오래된 미수금부터 채우고, 남는 것은 다음 미수금에 부분 반영한다. 정산서 미수금도 함께 갱신한다.
  res := record_receivable_payment(rest, 120000, 'transfer', '2001-01-21T09:00:00+09', null, null);
  if (res->>'applied')::numeric <> 120000 or (res->>'updated_count')::int <> 2 or (res->>'already_posted')::boolean then
    raise exception 'ASSERT A 응답 %', res;
  end if;
  select balance, status into b, s from receivables where id = r1;
  if b <> 0 or s <> 'paid' then raise exception 'ASSERT A r1 % %', b, s; end if;
  select balance, status into b, s from receivables where id = r2;
  if b <> 30000 or s <> 'partial' then raise exception 'ASSERT A r2 % %', b, s; end if;
  select outstanding_amount into o from sales_statements where id = st1;
  if o <> 0 then raise exception 'ASSERT A st1 outstanding %', o; end if;
  select outstanding_amount into o from sales_statements where id = st2;
  if o <> 30000 then raise exception 'ASSERT A st2 outstanding %', o; end if;
  select count(*) into n from payments where target_id in (r1, r2) and direction = 'inbound' and method = 'transfer';
  if n <> 2 then raise exception 'ASSERT A payments 행 수 %', n; end if;
  select count(*) into n from payments where target_id = r1 and amount = 100000 and paid_at = '2001-01-21T09:00:00+09';
  if n <> 1 then raise exception 'ASSERT A r1 payments 금액/입금일'; end if;

  -- B) 초과입금은 거절하고 아무것도 바꾸지 않는다. detail 에 미수금 합계가 실린다.
  begin
    perform record_receivable_payment(rest, 30001, 'transfer', now(), null, null);
    raise exception 'ASSERT B 초과입금이 통과했다';
  exception when others then
    if sqlerrm <> 'OVERPAY' then raise; end if;
    get stacked diagnostics s = pg_exception_detail;
    if s <> '30000' then raise exception 'ASSERT B detail %', s; end if;
  end;
  select balance into b from receivables where id = r2;
  if b <> 30000 then raise exception 'ASSERT B 잔액이 바뀌었다 %', b; end if;

  -- C) 미수금이 없는 업체 / 0원 / 잘못된 방법
  begin
    perform record_receivable_payment(rest2, 1000, 'transfer', now(), null, null);
    raise exception 'ASSERT C 미수금 없는 업체가 통과했다';
  exception when others then if sqlerrm <> 'NO_RECEIVABLES' then raise; end if; end;
  begin
    perform record_receivable_payment(rest, 0, 'transfer', now(), null, null);
    raise exception 'ASSERT C 0원이 통과했다';
  exception when others then if sqlerrm <> 'INVALID_AMOUNT' then raise; end if; end;
  begin
    perform record_receivable_payment(rest, 1000, 'bitcoin', now(), null, null);
    raise exception 'ASSERT C 잘못된 방법이 통과했다';
  exception when others then if sqlerrm <> 'INVALID_METHOD' then raise; end if; end;

  -- D) 은행 거래로 확정하면 거래에 반영 표시가 붙고, 같은 거래를 다시 확정해도 아무것도 바뀌지 않는다.
  insert into bank_transactions(account_ref, provider_tid, trdt, direction, amount) values ('t-acct', 'rp-tid-1', now(), 'in', 30000) returning id into bt;
  res := record_receivable_payment(rest, 30000, 'transfer', now(), null, bt);
  if (res->>'applied')::numeric <> 30000 or (res->>'already_posted')::boolean then raise exception 'ASSERT D 응답 %', res; end if;
  select count(*) into n from payments where bank_transaction_id = bt;
  if n <> 1 then raise exception 'ASSERT D payments 연결 수 %', n; end if;
  if (select posted_at from bank_transactions where id = bt) is null
     or (select posted_restaurant_id from bank_transactions where id = bt) <> rest then
    raise exception 'ASSERT D 거래에 반영 표시가 없다';
  end if;
  res := record_receivable_payment(rest, 30000, 'transfer', now(), null, bt);
  if not (res->>'already_posted')::boolean or (res->>'applied')::numeric <> 0 then raise exception 'ASSERT D 재확정 응답 %', res; end if;
  select count(*) into n from payments where bank_transaction_id = bt;
  if n <> 1 then raise exception 'ASSERT D 재확정으로 payments 가 늘었다 %', n; end if;

  -- E) 거래 금액과 다르거나, 출금 거래이거나, 없는 거래이면 거절한다.
  insert into bank_transactions(account_ref, provider_tid, trdt, direction, amount) values ('t-acct', 'rp-tid-2', now(), 'in', 500) returning id into bt;
  begin
    perform record_receivable_payment(rest, 400, 'transfer', now(), null, bt);
    raise exception 'ASSERT E 금액 불일치가 통과했다';
  exception when others then if sqlerrm <> 'BANK_TX_MISMATCH' then raise; end if; end;
  insert into bank_transactions(account_ref, provider_tid, trdt, direction, amount) values ('t-acct', 'rp-tid-3', now(), 'out', 500) returning id into bt;
  begin
    perform record_receivable_payment(rest, 500, 'transfer', now(), null, bt);
    raise exception 'ASSERT E 출금이 통과했다';
  exception when others then if sqlerrm <> 'BANK_TX_MISMATCH' then raise; end if; end;
  begin
    perform record_receivable_payment(rest, 500, 'transfer', now(), null, gen_random_uuid());
    raise exception 'ASSERT E 없는 거래가 통과했다';
  exception when others then if sqlerrm <> 'BANK_TX_NOT_FOUND' then raise; end if; end;

  -- G) 금액 가드(2026-09-26 리뷰): 원 단위 정수만, NaN/Infinity 거절. 잔액 0 인 미납 미수금은 입금 대상이 아니다.
  begin
    perform record_receivable_payment(rest, 100.005, 'transfer', now(), null, null);
    raise exception 'ASSERT G 소수 금액이 통과했다';
  exception when others then if sqlerrm <> 'INVALID_AMOUNT' then raise; end if; end;
  begin
    perform record_receivable_payment(rest, 'NaN'::numeric, 'transfer', now(), null, null);
    raise exception 'ASSERT G NaN 이 통과했다';
  exception when others then if sqlerrm <> 'INVALID_AMOUNT' then raise; end if; end;
  begin
    perform record_receivable_payment(rest, 'Infinity'::numeric, 'transfer', now(), null, null);
    raise exception 'ASSERT G Infinity 가 통과했다';
  exception when others then if sqlerrm <> 'INVALID_AMOUNT' then raise; end if; end;
  insert into organizations(organization_type, name) values ('restaurant', '__test_rp3__') returning id into org3;
  insert into restaurants(organization_id) values (org3) returning id into rest3;
  insert into settlement_periods(period_type, start_date, end_date) values ('weekly', '2001-01-15', '2001-01-21') returning id into per3;
  insert into sales_statements(restaurant_id, settlement_period_id, total_amount, outstanding_amount) values (rest3, per3, 0, 0) returning id into st3;
  insert into receivables(restaurant_id, statement_id, due_date, balance, status) values (rest3, st3, '2001-01-30', 0, 'unpaid');
  begin
    perform record_receivable_payment(rest3, 1000, 'transfer', now(), null, null);
    raise exception 'ASSERT G 잔액 0 미수금에 입금이 통과했다';
  exception when others then if sqlerrm <> 'NO_RECEIVABLES' then raise; end if; end;

  -- F) 일반 사용자는 이 함수를 실행할 수 없다.
  if has_function_privilege('anon', 'public.record_receivable_payment(uuid,numeric,text,timestamptz,uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.record_receivable_payment(uuid,numeric,text,timestamptz,uuid,uuid)', 'execute') then
    raise exception 'ASSERT F anon/authenticated 가 실행할 수 있다';
  end if;
end $$;

select 'record_receivable_payment 검증 통과' as result;
rollback;
