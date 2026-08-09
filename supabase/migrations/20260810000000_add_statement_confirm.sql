-- 정산서 확정(잠금)과 통지.
--
-- 거래처에 넘긴 금액이 나중에 바뀌면 시스템 계산을 믿지 못한다.
-- 할매 천호점 435,700 이 3주간 이월된 것이 계기다 (2026-08-09 0 처리).
-- 7/13 발주는 제때 왔는데 명세서가 열흘 늦게 생겨, 이미 수금이 끝난 주의 청구액이
-- 뒤늦게 211,900 올라갔다.
--
-- confirmed_total 을 따로 두는 이유: 어떤 경로로든 금액이 바뀌었을 때
-- 「넘긴 금액과 지금 금액이 다르다」를 즉시 잡기 위해서다. 이 대조가 없어 3주를 굴러다녔다.

alter table public.sales_statements
  add column if not exists confirmed_at    timestamptz,
  add column if not exists confirmed_by    uuid,
  add column if not exists confirmed_total numeric,
  add column if not exists notified_at     timestamptz;

create index if not exists sales_statements_confirmed_idx
  on public.sales_statements (confirmed_at)
  where confirmed_at is not null;

-- 로그인 없이 여는 정산서 링크.
-- 문자를 받은 거래처가 그 자리에서 열 수 있어야 한다. 로그인부터 하라고 하면 아무도 안 본다.
-- 대신 명세서 내역이 담기므로 유효기간(7일)으로 노출 범위를 제한한다.
create table if not exists public.statement_share_links (
  token        text primary key,
  statement_id uuid not null references public.sales_statements(id) on delete cascade,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

create index if not exists statement_share_links_statement_idx
  on public.statement_share_links (statement_id);

-- RLS 를 켜 두되 정책은 두지 않는다. 읽고 쓰는 것은 service role 뿐이라 RLS 를 지나간다.
alter table public.statement_share_links enable row level security;

-- 이미 완납된 과거 정산서는 확정된 것으로 본다. 이미 받은 돈이라 금액이 바뀌면 안 된다.
-- confirmed_by 는 비워 둔다 — 사람이 확정한 건과 구분되어 되돌릴 때 기준이 된다.
update public.sales_statements s
set confirmed_at    = coalesce(last_pay.paid_at, s.created_at),
    confirmed_total = s.total_amount
from (
  select rc.statement_id, max(p.paid_at) as paid_at
  from public.receivables rc
  join public.payments p on p.target_type = 'receivable' and p.target_id = rc.id
  group by rc.statement_id
) last_pay
where last_pay.statement_id = s.id
  and s.confirmed_at is null
  and exists (
    select 1 from public.receivables rc2
    where rc2.statement_id = s.id
    group by rc2.statement_id
    having bool_and(rc2.status = 'paid')
  );

-- 입금 기록 없이 잔액만 0 으로 정리된 완납 건도 있다(과거 이력).
-- 그런 건은 위 조인에 안 걸리므로 생성 시각으로 채운다.
update public.sales_statements s
set confirmed_at    = s.created_at,
    confirmed_total = s.total_amount
where s.confirmed_at is null
  and exists (
    select 1 from public.receivables rc2
    where rc2.statement_id = s.id
    group by rc2.statement_id
    having bool_and(rc2.status = 'paid')
  );
