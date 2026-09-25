-- 은행 원거래 테이블 검증. 실행: execute_sql 로 통째로. 통과하면 마지막 select 가 한 줄 나온다.
begin;

do $$
declare
  rest uuid; org uuid; a uuid; ok boolean;
begin
  -- 1) 테이블·컬럼이 있다
  perform 1 from information_schema.columns where table_schema='public' and table_name='bank_transactions' and column_name='provider_tid';
  if not found then raise exception 'ASSERT bank_transactions 없음'; end if;
  perform 1 from information_schema.columns where table_schema='public' and table_name='payments' and column_name='bank_transaction_id';
  if not found then raise exception 'ASSERT payments.bank_transaction_id 없음'; end if;

  -- 2) 픽스처
  insert into organizations(organization_type, name) values ('restaurant', '__test_bt__') returning id into org;
  insert into restaurants(organization_id) values (org) returning id into rest;

  -- 3) 같은 (계좌, tid) 는 두 번 못 넣는다
  insert into bank_transactions(account_ref, provider_tid, trdt, direction, amount) values ('t-acct', 'tid-1', now(), 'in', 1000);
  begin
    insert into bank_transactions(account_ref, provider_tid, trdt, direction, amount) values ('t-acct', 'tid-1', now(), 'in', 1000);
    raise exception 'ASSERT 중복 tid 가 들어갔다';
  exception when unique_violation then null; end;
  -- 다른 계좌면 같은 tid 도 허용
  insert into bank_transactions(account_ref, provider_tid, trdt, direction, amount) values ('t-acct-2', 'tid-1', now(), 'in', 1000);

  -- 4) 금액은 양수, 방향은 in/out
  begin
    insert into bank_transactions(account_ref, provider_tid, trdt, direction, amount) values ('t-acct', 'tid-0', now(), 'in', 0);
    raise exception 'ASSERT 0원이 들어갔다';
  exception when check_violation then null; end;
  begin
    insert into bank_transactions(account_ref, provider_tid, trdt, direction, amount) values ('t-acct', 'tid-x', now(), 'sideways', 10);
    raise exception 'ASSERT 잘못된 방향이 들어갔다';
  exception when check_violation then null; end;

  -- 5) 별칭은 업체 안에서 유일, 다른 업체와는 같아도 된다(충돌은 판정에서 잡는다)
  insert into depositor_aliases(restaurant_id, alias_raw, alias_norm) values (rest, '홍길동', '홍길동');
  begin
    insert into depositor_aliases(restaurant_id, alias_raw, alias_norm) values (rest, '홍 길동', '홍길동');
    raise exception 'ASSERT 같은 업체에 같은 별칭이 두 번 들어갔다';
  exception when unique_violation then null; end;
  begin
    insert into depositor_aliases(restaurant_id, alias_raw, alias_norm) values (rest, ' ', '');
    raise exception 'ASSERT 빈 별칭이 들어갔다';
  exception when check_violation then null; end;

  -- 6) 판정은 거래당 한 건, 값은 셋 중 하나
  select id into a from bank_transactions where provider_tid='tid-1' and account_ref='t-acct';
  insert into payment_matches(bank_transaction_id, verdict, rule_version) values (a, 'REVIEW', 'v1');
  begin
    insert into payment_matches(bank_transaction_id, verdict, rule_version) values (a, 'AUTO_MATCH', 'v1');
    raise exception 'ASSERT 같은 거래에 판정이 두 건 들어갔다';
  exception when unique_violation then null; end;
  begin
    insert into payment_matches(bank_transaction_id, verdict, rule_version) values (a, 'MAYBE', 'v1');
    raise exception 'ASSERT 잘못된 판정값';
  exception when check_violation or unique_violation then null; end;

  -- 7) 일반 사용자 권한은 없다(서비스 롤만)
  select has_table_privilege('anon', 'public.bank_transactions', 'select')
      or has_table_privilege('authenticated', 'public.bank_transactions', 'select')
      or has_table_privilege('anon', 'public.depositor_aliases', 'select')
      or has_table_privilege('authenticated', 'public.payment_matches', 'select') into ok;
  if ok then raise exception 'ASSERT anon/authenticated 에게 권한이 남아 있다'; end if;
end $$;

select 'bank_tables 검증 통과' as result;
rollback;
