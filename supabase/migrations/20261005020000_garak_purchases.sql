-- 가락 매입 기록: 날짜·품목·단위별로 가락에서 산 수량과 매입가.
-- 1단계에서는 기록만 한다. 명세서 단가에는 아직 반영하지 않는다(배정·가락 단가 적용은 다음 단계).
create table if not exists public.garak_purchases (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  product_id uuid not null references public.products(id),
  unit text not null,
  qty numeric not null check (qty > 0),
  unit_price numeric not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  constraint garak_purchases_day_product_unit_key unique (business_date, product_id, unit)
);

alter table public.garak_purchases enable row level security;
