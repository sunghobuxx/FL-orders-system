-- 업체별 고정단가 테이블 복구.
--
-- 코드 7곳(admin/products/actions.ts, api/admin/products/org-prices, products/[id]/page.tsx,
-- api/admin/orders/generate-specs)이 이 테이블을 쓰는데 Mumbai·Seoul 양쪽 DB에 존재하지 않았다.
-- 조회 결과의 error를 검사하지 않는 코드라 조용히 무시되면서, 업체별 고정단가 기능이
-- 배포된 이후로 한 번도 동작하지 않았다. (2026-07-26 확인)
--
-- generate-specs 의 단가 우선순위 0단계가 이 테이블이다:
--   0. org_product_prices  → price_overridden=true 로 저장
--   1. 배송일과 같은 날짜의 단가   2. 고정단가 품목   3. carry-forward

create table if not exists public.org_product_prices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  unit_price      numeric not null check (unit_price > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- 코드가 onConflict: 'organization_id,product_id' 로 upsert 한다
  unique (organization_id, product_id)
);

create index if not exists org_product_prices_product_id_idx
  on public.org_product_prices(product_id);

alter table public.org_product_prices enable row level security;

-- 어드민(운영사/플랫폼)만 조회. 쓰기는 service_role(서버)만.
create policy org_product_prices_admin_read on public.org_product_prices
  for select using (
    auth.uid() in (
      select m.user_id from public.memberships m
      join public.organizations o on o.id = m.organization_id
      where o.organization_type = any (array['platform', 'operator'])
    )
  );

create policy org_product_prices_service_write on public.org_product_prices
  for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';
