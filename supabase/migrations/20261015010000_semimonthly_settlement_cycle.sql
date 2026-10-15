-- 반월정산(semimonthly): 매달 1~15일, 16일~말일. 인계점이 2026-10-15 처음 썼다.
alter table public.restaurants drop constraint restaurants_settlement_cycle_check;
alter table public.restaurants add constraint restaurants_settlement_cycle_check
  check (settlement_cycle = any (array['daily', 'weekly', 'monthly', 'semimonthly']));

alter table public.settlement_periods drop constraint settlement_periods_period_type_check;
alter table public.settlement_periods add constraint settlement_periods_period_type_check
  check (period_type = any (array['daily', 'weekly', 'monthly', 'semimonthly']));
