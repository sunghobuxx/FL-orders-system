-- 세금계산서를 과세·면세로 나눠 발행한다. 한 달에 업체당 과세 한 장, 면세 한 장까지 나올 수 있다.
alter table public.tax_invoices add column if not exists tax_type text not null default '과세';

alter table public.tax_invoices drop constraint if exists tax_invoices_tax_type_check;
alter table public.tax_invoices add constraint tax_invoices_tax_type_check
  check (tax_type in ('과세', '면세'));

alter table public.tax_invoices drop constraint if exists tax_invoices_restaurant_id_invoice_month_key;
alter table public.tax_invoices add constraint tax_invoices_restaurant_month_type_key
  unique (restaurant_id, invoice_month, tax_type);
