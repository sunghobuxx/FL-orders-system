-- 세금계산서 발행 단위를 정산기간 → 달력상 월로 바꾼다. 정산주기가 주/일인 업체(45/61, 대부분)는
-- 정산기간이 한 달과 안 맞아서, 정산기간 단위로는 "이번 달치 한 번에" 발행이 안 됐다
-- (2026-09-30 사장님 질문으로 발견). 한국 실무의 월합계세금계산서(작성일자=말일, 익월 10일까지 발행)
-- 를 따르려면 정산주기와 무관하게 달력상 월(1일~말일)로 집계해야 한다.
-- tax_invoices 는 발행 기능이 아직 OFF 라 운영 데이터가 없다 — 안전하게 바로 구조를 바꾼다.

alter table public.tax_invoices drop constraint tax_invoices_restaurant_id_settlement_period_id_key;
alter table public.tax_invoices drop constraint tax_invoices_settlement_period_id_fkey;
alter table public.tax_invoices drop column settlement_period_id;

alter table public.tax_invoices add column invoice_month date not null default '2026-01-01';
alter table public.tax_invoices alter column invoice_month drop default;

alter table public.tax_invoices add constraint tax_invoices_restaurant_id_invoice_month_key unique (restaurant_id, invoice_month);
