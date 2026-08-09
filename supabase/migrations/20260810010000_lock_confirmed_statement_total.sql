-- 확정된 정산서의 청구액을 DB 차원에서 잠근다.
--
-- 애플리케이션 잠금은 두 함수(generateStatements, syncStatementFinance) 입구에 있다.
-- 그 두 곳을 지나지 않는 경로가 생기면 또 뚫린다. 오늘 하루만 봐도 그런 일이 세 번 있었다 —
-- 모바일 앱이 웹 API 를 건너뛰고, 어드민 품목 추가가 dispatch 를 안 건드리고,
-- 서버 액션이 404 로 죽었다.
--
-- 이 트리거는 마지막 방어선이다. 어떤 코드로도, 직접 SQL 로도 못 뚫는다.
-- 평소에는 절대 걸리지 않는다. 걸린다면 그게 곧 버그 신호다.
--
-- ★ total_amount 만 잠근다. outstanding_amount 는 막지 않는다.
--   확정은 「거래처에 넘긴 청구액을 고정한다」는 뜻이지 「입금을 막는다」가 아니다.
--   입금(api/admin/finance/record-payment)은 outstanding_amount 와 receivables 만
--   건드리므로 이 트리거에 걸리지 않는다. 둘을 구분하지 않고 막으면 수금이 안 된다.

create or replace function public.reject_confirmed_statement_total_change()
returns trigger
language plpgsql
as $$
begin
  -- 확정 전이면 자유롭게 바꾼다
  if old.confirmed_at is null then
    return new;
  end if;

  -- 확정을 해제하는 경로는 만들지 않았다. 그래도 값이 그대로면 통과시킨다.
  if new.total_amount is not distinct from old.total_amount then
    return new;
  end if;

  raise exception
    '확정된 정산서의 청구액은 바꿀 수 없습니다 (statement=%, 확정=%, 시도=%)',
    old.id, old.total_amount, new.total_amount
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists lock_confirmed_statement_total on public.sales_statements;

create trigger lock_confirmed_statement_total
  before update of total_amount on public.sales_statements
  for each row
  execute function public.reject_confirmed_statement_total_change();
