-- 세금계산서(계산서)를 받을 이메일. 발행 때 팝빌 invoiceeEmail1 로 넘겨 발행 알림 메일이 간다.
alter table public.restaurants
  add column if not exists tax_invoice_email text;
