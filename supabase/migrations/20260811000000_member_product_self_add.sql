-- 회원이 발주 품목을 직접 추가한다.
--
-- 지금은 관리자가 업체별로 품목을 하나하나 등록해 줘야 해서, 회원은 자기 목록에 없는
-- 품목을 못 시킨다. 업체당 평균 14개만 열려 있는데 활성 품목은 137개다.
--
-- 회원이 넣은 것과 관리자가 넣은 것을 구분해야 한다. 관리자가 정해 준 기본 품목을
-- 회원이 빼 버리면 안 되기 때문이다.

alter table public.restaurant_products
  add column if not exists added_by      text not null default 'admin',
  add column if not exists added_by_user uuid,
  add column if not exists added_at      timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurant_products_added_by_check') then
    alter table public.restaurant_products
      add constraint restaurant_products_added_by_check check (added_by in ('admin', 'member'));
  end if;
end $$;

-- 기존 538 건은 전부 관리자가 넣은 것이다. default 'admin' 이 그대로 맞다.

-- 단가가 없는 품목은 바로 열지 않고 여기 쌓는다.
--
-- restaurant_products 에 status 를 붙이지 않고 표를 따로 두는 이유:
-- 발주 화면이 restaurant_products 를 그대로 읽는다(app/member/order/page.tsx).
-- 대기 상태를 같은 표에 섞으면 아직 안 열린 품목이 발주 목록에 새어 나갈 수 있다.
-- 조회 한 줄만 빼먹어도 그렇게 된다.
--
-- 단가 없이 발주되면 명세서가 0 원으로 나간다. 2026-08-09 에 일회용 손장갑이 그랬다.
create table if not exists public.product_requests (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  product_id    uuid not null references public.products(id)    on delete cascade,
  requested_by  uuid,
  requested_at  timestamptz not null default now(),
  status        text not null default 'pending',
  decided_at    timestamptz,
  decided_by    uuid,
  constraint product_requests_status_check check (status in ('pending', 'approved', 'rejected'))
);

-- 같은 품목을 여러 번 요청하지 못하게 한다. 처리된 건은 다시 요청할 수 있어야 하므로
-- pending 일 때만 막는다.
create unique index if not exists product_requests_pending_uniq
  on public.product_requests (restaurant_id, product_id)
  where status = 'pending';

create index if not exists product_requests_pending_idx
  on public.product_requests (status, requested_at desc)
  where status = 'pending';

alter table public.product_requests enable row level security;
-- 정책을 두지 않는다. 읽고 쓰는 것은 service role 뿐이라 RLS 를 지나간다.
