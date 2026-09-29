-- bank_transactions 금액 가드 검증. 실행: execute_sql 로 통째로. 통과하면 마지막 select 가 한 줄 나온다.
begin;

do $$
begin
  begin
    insert into bank_transactions(account_ref, provider_tid, trdt, direction, amount) values ('t-acct', 'g-tid-1', now(), 'in', 100.5);
    raise exception 'ASSERT 소수 금액이 들어갔다';
  exception when check_violation then null; end;

  -- postgres numeric 은 정렬을 위해 NaN=NaN, Infinity=trunc(Infinity) 를 참으로 본다(IEEE754 와 다르다).
  -- amount = trunc(amount) 만으로는 못 막아서 명시적으로 제외해야 한다.
  begin
    insert into bank_transactions(account_ref, provider_tid, trdt, direction, amount) values ('t-acct', 'g-tid-2', now(), 'in', 'NaN'::numeric);
    raise exception 'ASSERT NaN 이 들어갔다';
  exception when check_violation then null; end;

  begin
    insert into bank_transactions(account_ref, provider_tid, trdt, direction, amount) values ('t-acct', 'g-tid-3', now(), 'in', 'Infinity'::numeric);
    raise exception 'ASSERT Infinity 가 들어갔다';
  exception when check_violation then null; end;

  -- 정수 금액은 그대로 된다(회귀 없음)
  insert into bank_transactions(account_ref, provider_tid, trdt, direction, amount) values ('t-acct', 'g-tid-4', now(), 'in', 1000);
end $$;

select 'bank_transactions 금액 가드 통과' as result;
rollback;
