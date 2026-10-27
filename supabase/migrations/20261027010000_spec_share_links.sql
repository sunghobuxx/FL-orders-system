-- 당일명세서를 문자로 보내는 기능.
--
-- statement_share_links(정산서)와 같은 패턴 — 로그인 없이 여는 공유 링크.
-- 문자를 받은 거래처가 그 자리에서 열 수 있어야 한다. 명세서 내역이 담기므로
-- 유효기간(7일)으로 노출 범위를 제한한다.
create table if not exists public.spec_share_links (
  token         text primary key,
  daily_spec_id uuid not null references public.daily_specs(id) on delete cascade,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists spec_share_links_spec_idx
  on public.spec_share_links (daily_spec_id);

-- RLS 를 켜 두되 정책은 두지 않는다. 읽고 쓰는 것은 service role 뿐이라 RLS 를 지나간다.
alter table public.spec_share_links enable row level security;

-- 언제 보냈는지 기록 — 버튼 재발송 여부 판단에 쓴다.
alter table public.daily_specs
  add column if not exists notified_at timestamptz;
