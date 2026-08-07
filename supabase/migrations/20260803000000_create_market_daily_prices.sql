-- 가락시장 경매 실적 일별 집계.
--
-- /api/admin/market/collect 가 공공데이터포털 «실시간 경매정보» 를 하루치 받아
-- 품목·단위별 가중평균 낙찰가와 반입량으로 줄여 쌓는 곳이다.
-- 낙찰 건별 원자료는 하루 3~4만 건이라 그대로는 비교에 쓸 수 없다.
--
-- 읽는 쪽은 두 군데뿐이고 둘 다 이 표 하나만 본다. 그래야 숫자가 어긋나지 않는다.
--   회원 대시보드 수급위험  → 반입량(total_qty) 변화
--   어드민 전체매출 시세추이 → 낙찰가(avg_price)
--
-- 2026-08-03 에 DB 에 직접 만들어 쓰기 시작했고 마이그레이션이 없었다.
-- 이 파일은 그때 만든 것과 같은 모양을 남겨 두는 것이라 이미 있는 DB 에 다시 돌려도
-- 바뀌는 것이 없다.

create table if not exists public.market_daily_prices (
  id           uuid primary key default gen_random_uuid(),
  trade_date   date        not null,
  market_code  text        not null,
  market_name  text,
  mclsf_name   text        not null,
  unit_name    text        not null default '',
  -- 단위(kg 등) 당 가격. 낙찰 총액 ÷ 총 물량.
  -- 포장당 낙찰가를 그대로 넣으면 안 된다(깐마늘이 kg당 70,750원으로 잡혔던 적이 있다).
  avg_price    numeric     not null default 0,
  total_qty    numeric     not null default 0,
  trade_count  integer     not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 같은 날짜를 다시 수집해도 결과가 같아야 한다. collect 의 upsert 대상 키다.
create unique index if not exists market_daily_prices_uniq
  on public.market_daily_prices (trade_date, market_code, mclsf_name, unit_name);

-- 품목별 최근 흐름을 뽑는 조회용
create index if not exists market_daily_prices_lookup_idx
  on public.market_daily_prices (mclsf_name, trade_date desc);

create index if not exists market_daily_prices_date_idx
  on public.market_daily_prices (trade_date desc);

alter table public.market_daily_prices enable row level security;

-- 공개 시세라 로그인한 사람은 누구나 읽는다. 쓰기는 collect(service role)만 한다.
do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.market_daily_prices'::regclass
      and polname = 'market_daily_prices_read'
  ) then
    create policy market_daily_prices_read
      on public.market_daily_prices
      for select to authenticated
      using (true);
  end if;
end $$;
