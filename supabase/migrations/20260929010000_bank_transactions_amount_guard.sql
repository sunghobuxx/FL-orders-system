-- bank_transactions 금액 가드. 팝빌 계좌조회는 원 단위 정수만 보낸다(공식 문서·실접속 확인).
-- 30분마다 자동으로 돌아가는 수집 크론이 실수로라도 소수·NaN·Infinity 금액을 저장하면
-- record_receivable_payment 의 원 단위 정수 가드(20260926020000)에 걸려 확정이 막히고 원인을
-- 찾기 어렵다. 저장하는 시점에 먼저 막는다(2026-09-29, 최종 리뷰 Minor 지적 마무리).

-- amount = trunc(amount) 만으로는 NaN·Infinity 를 못 막는다. postgres numeric 은 정렬을 위해
-- NaN = NaN, Infinity = trunc(Infinity) 를 참으로 본다(IEEE754 부동소수와 다르다, 2026-09-29 확인).
alter table public.bank_transactions
  add constraint bank_transactions_amount_integer
  check (amount not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) and amount = trunc(amount));
