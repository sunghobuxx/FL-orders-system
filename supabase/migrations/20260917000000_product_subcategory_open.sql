-- 품목 분류 2단 전환 1/2 — 칸과 제약을 먼저 연다.
--
-- 대분류 9개 고정 + 소분류로 확장하는 체계로 바꾼다(2026-09-17 사장님 확정).
-- 이 단계는 **옛 값과 새 값을 모두 허용**만 한다. 데이터는 아직 안 바꾼다 —
-- 새 코드가 배포되기 전에 값을 바꾸면 회원 발주 화면에서 품목이 사라진다
-- (그 화면은 목록에 없는 분류를 걸러낸다).
alter table products add column if not exists subcategory text;
comment on column products.subcategory is '소분류. 대분류는 고정하고 새 품목은 여기로 받는다';

alter table products drop constraint if exists products_category_check;
alter table products add constraint products_category_check check (category = any (array[
  -- 새 대분류 9개
  'vegetable','fruit','livestock','seafood','grain','seasoning','frozen','misc','supply',
  -- 전환 중에만 남는 옛 값
  'meat','dairy','etc'
]));
