-- 당일 단가 확정 표시.
--
-- 사장님이 「오늘 단가 확정」을 누른 시각만 저장한다. 「입력 중 / 확정 / 수정됨」 상태는
-- 저장하지 않고 화면을 열 때 계산한다: 확정 뒤에 그 날짜(effective_from)의 단가가
-- 새로 등록되면 「수정됨」. 단가를 넣는 경로가 몇 개든 created_at 은 DB 가 채우므로
-- 자동으로 감지된다.

create table if not exists public.price_confirmations (
  business_date date primary key,
  confirmed_at  timestamptz not null default now(),
  confirmed_by  uuid
);

-- RLS 를 켜 두되 정책은 두지 않는다. 읽고 쓰는 것은 service role 뿐이라 RLS 를 지나간다.
alter table public.price_confirmations enable row level security;

-- 날짜별 단가 마지막 등록 시각. 날짜 수(최대 약 31행)만 읽으므로 PostgREST 1,000행 제한에 걸리지 않는다.
create or replace view public.price_day_last_change as
select effective_from as business_date, max(created_at) as last_price_at
from public.price_snapshots
group by effective_from;

revoke all on public.price_day_last_change from anon, authenticated;

-- 확정 / 재확정. 시각을 앱 서버가 아니라 DB 시계(now())로 찍어야
-- price_snapshots.created_at 과 순서가 맞는다.
create or replace function public.confirm_price_day(p_date date, p_user uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  t timestamptz;
begin
  insert into public.price_confirmations (business_date, confirmed_at, confirmed_by)
  values (p_date, now(), p_user)
  on conflict (business_date)
  do update set confirmed_at = now(), confirmed_by = p_user
  returning confirmed_at into t;
  return t;
end;
$$;

revoke all on function public.confirm_price_day(date, uuid) from public, anon, authenticated;
grant execute on function public.confirm_price_day(date, uuid) to service_role;
