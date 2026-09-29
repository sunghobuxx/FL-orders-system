-- 세금계산서 발행 기반(2단계). restaurants.ceo_name — 세금계산서 공급받는자 대표자성명은 법정 필수 항목인데
-- 지금 DB 에 없다(biz_no 처럼 사장님이 채워야 함). tax_invoices — 발행 결과를 저장하고,
-- (restaurant_id, settlement_period_id) unique 로 같은 정산기간 중복 발행을 막는다.

alter table public.restaurants add column if not exists ceo_name text;

create table if not exists public.tax_invoices (
  id                    uuid primary key default gen_random_uuid(),
  restaurant_id         uuid not null references public.restaurants(id),
  settlement_period_id  uuid not null references public.settlement_periods(id),
  mgt_key               text not null unique,
  status                text not null check (status in ('issued', 'rejected', 'unknown')),
  supply_cost_total     numeric not null,
  tax_total             numeric not null,
  total_amount          numeric not null,
  nts_confirm_num       text,
  error_message         text,
  issued_at             timestamptz,
  created_by            uuid,
  created_at            timestamptz not null default now(),
  -- 같은 업체·같은 정산기간은 한 번만 발행한다(이중 발행 차단). status='rejected' 로 남은 건도
  -- 재시도 전에 이 행을 지우거나 봐야 한다 — 조용히 다시 발행되지 않는다.
  unique (restaurant_id, settlement_period_id)
);

alter table public.tax_invoices enable row level security;
revoke all on public.tax_invoices from anon, authenticated;
