-- 식당별 가락 예외: 가락시장이 열려 있고 서울·일산 주소라도, 이 식당은 이 날짜만
-- 가락 대신 남촌(기존) 공급처로 간다. 신규 지점이 가락 매입을 아직 못 시작했을 때 쓴다
-- (2026-10-11, 화곡중앙시장점 첫 사용). garak_closed_dates 와 같은 구조, 식당 단위로 좁힌 것.
create table if not exists public.restaurant_garak_overrides (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  business_date date not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (restaurant_id, business_date)
);

alter table public.restaurant_garak_overrides enable row level security;
