-- 가락 매입 기록에 식당 공급가를 함께 넣는다(기존 품목과 같이 매입가·공급가를 둘 다 입력).
-- 배정된 발주 줄에만 이 공급가를 적용한다.
alter table public.garak_purchases add column if not exists sale_price numeric
  check (sale_price is null or sale_price >= 0);
