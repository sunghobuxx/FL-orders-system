-- 입금 요청 문자를 마지막으로 보낸 시각.
-- 정산 확정 화면의 「입금요청」 버튼으로 사장님이 보낸 시각이다. 다시 보내면 새 시각으로 바뀌고,
-- 발송에 실패하면 남기지 않는다 — 안 나간 걸 보낸 것처럼 보이면 안 된다.
alter table sales_statements
  add column if not exists payment_requested_at timestamptz;

comment on column sales_statements.payment_requested_at is
  '입금 요청 문자를 마지막으로 보낸 시각 (발송 성공 시에만 기록)';
