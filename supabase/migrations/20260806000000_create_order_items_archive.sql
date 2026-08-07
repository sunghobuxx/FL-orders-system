-- 지워지기 직전의 발주 품목 보관소.
--
-- 회원 발주 저장은 기존 order_items 를 전부 지우고 다시 넣는다. 마감 전 재발주를
-- 상정한 동작인데, 엉뚱한 날짜 배치에 걸리면 그날 발주가 통째로 사라진다.
-- 2026-07-28 고강점 사고: 7/29 발주가 6/19 배치에 들어가 이미 정산·완납까지 끝난
-- 6/19 의 147,200원어치가 어제 발주 10줄로 교체됐고, 원본은 DB 어디에도 남지 않았다.
--
-- 본 방어는 지난 날짜 저장 자체를 막는 것이고(api/member/orders 의 businessDate 검사),
-- 이 표는 그래도 뚫렸을 때 되돌리기 위한 안전망이다.
--
-- amount·memo 는 담지 않는다. 금액은 qty × unit_price_snapshot 로 되살아난다.
--
-- 2026-08-03 무렵 DB 에 직접 만들어 두고 마이그레이션이 없었다(쓰는 코드도 없었다).
-- 이제 lib/orders/archive-items.ts 가 쓰므로 리포에 남겨 둔다.

create table if not exists public.order_items_archive (
  id                  uuid primary key default gen_random_uuid(),
  order_item_id       uuid not null,
  order_id            uuid not null,
  -- 어느 업체의 며칠치였는지는 order_batches 에만 있다. 사고를 되짚을 때
  -- 주문 id 만으로는 찾을 수 없어 여기에 함께 적어 둔다.
  batch_id            uuid,
  restaurant_id       uuid,
  business_date       date,
  product_id          uuid,
  qty                 numeric,
  unit                text,
  unit_price_snapshot numeric,
  supplier_product_id uuid,
  reason              text        not null default 'resubmit',
  archived_at         timestamptz not null default now()
);

-- "그 업체 그 날짜에 뭐가 있었나" 로 되짚는 게 주 용도다.
create index if not exists order_items_archive_lookup_idx
  on public.order_items_archive (restaurant_id, business_date, archived_at desc);

create index if not exists order_items_archive_batch_idx
  on public.order_items_archive (batch_id, archived_at desc);

-- RLS 를 켜 두되 정책은 두지 않는다. 회원도 어드민 세션도 이 표를 볼 일이 없고,
-- 쓰고 읽는 것은 service role(createAdminClient) 뿐이라 RLS 를 그냥 지나간다.
alter table public.order_items_archive enable row level security;
