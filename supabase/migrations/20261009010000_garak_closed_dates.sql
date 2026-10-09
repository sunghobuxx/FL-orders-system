-- 가락시장 휴무일: 그날은 서울·일산 식당도 가락이 아니라 남촌(기존) 공급처로 간다.
-- 사장님이 직접 토글한다(2026-10-09, 가락시장 휴무로 첫 사용).
create table if not exists public.garak_closed_dates (
  business_date date primary key,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.garak_closed_dates enable row level security;
