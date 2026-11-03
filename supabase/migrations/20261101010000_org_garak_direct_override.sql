-- 주소는 서울·일산이 아니지만, 가락시장 직접구매(서울·일산과 같은 방식)로 다루길
-- 원하는 업체를 위한 수동 예외. 주소를 거짓으로 바꾸지 않고 따로 켠다.
-- (2026-11-01, 마이웨이·뽈마루 대구뽈찜 — 실제 주소는 파주)
alter table public.organizations
  add column if not exists garak_direct_override boolean not null default false;
