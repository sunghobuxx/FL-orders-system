-- 일정산(daily) 주기 추가.
-- 바로바로 입금하는 업체가 있어 하루 단위 정산이 필요하다.
--
-- 기존 제약은 weekly/monthly 만 허용했다.

alter table public.restaurants
  drop constraint if exists restaurants_settlement_cycle_check;
alter table public.restaurants
  add constraint restaurants_settlement_cycle_check
  check (settlement_cycle = any (array['daily', 'weekly', 'monthly']));

alter table public.settlement_periods
  drop constraint if exists settlement_periods_period_type_check;
alter table public.settlement_periods
  add constraint settlement_periods_period_type_check
  check (period_type = any (array['daily', 'weekly', 'monthly']));

-- 같은 유형·기간이 두 번 만들어지지 않게 한다.
-- 지금까지 정산서를 수동으로 넣어와서 중복이 생기기 쉬웠다.
create unique index if not exists settlement_periods_type_range_key
  on public.settlement_periods (period_type, start_date, end_date);

-- 한 정산기간에 같은 업체 정산서가 두 장 생기지 않게 한다.
create unique index if not exists sales_statements_period_restaurant_key
  on public.sales_statements (settlement_period_id, restaurant_id);

notify pgrst, 'reload schema';
