-- 가락 매입 품목 배정: 같은 날 같은 품목의 발주 줄 하나를 가락 물량 전체 대상으로 고른다.
-- 줄을 나누지 않는다(사장님 기준: 일부 배정 없음). 2단계에서는 기록만 하고 명세서 금액은 바꾸지 않는다.
create table if not exists public.garak_allocations (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  product_id uuid not null references public.products(id),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint garak_allocations_day_product_key unique (business_date, product_id)
);

alter table public.garak_allocations enable row level security;
