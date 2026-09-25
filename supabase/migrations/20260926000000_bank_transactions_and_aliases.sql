-- 팝빌 계좌조회 연동의 기반. 은행 원거래·입금자 별칭·자동매칭 판정.
-- 이 마이그레이션은 추가만 한다(payments 에 nullable 컬럼 하나). 수집기는 아직 없다.
--
-- 원칙
--  * 은행 원거래(bank_transactions)와 내부 수금 반영(payments)을 분리한다. 원거래는 그대로 쌓고,
--    확정할 때 record_receivable_payment 가 payments 로 옮기며 posted_at 을 찍는다.
--  * 같은 거래를 두 번 넣지 않도록 (account_ref, provider_tid) 를 유일키로 한다.
--    provider_tid 는 팝빌 tid. 재수집 때 같은 값인지는 팝빌 확인이 남은 항목이라 계좌 범위로만 유일하게 둔다.
--  * 계좌번호 원문은 저장하지 않는다. account_ref 는 「nh-main」 같은 별칭이다.

create table if not exists public.bank_transactions (
  id                   uuid primary key default gen_random_uuid(),
  account_ref          text not null,
  provider_tid         text not null,
  trdt                 timestamptz not null,
  direction            text not null check (direction in ('in', 'out')),
  amount               numeric not null check (amount > 0),
  balance              numeric,
  depositor_raw        text,
  depositor_norm       text,
  raw                  jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  posted_at            timestamptz,
  posted_restaurant_id uuid references public.restaurants(id),
  posted_by            uuid references public.users(id),
  unique (account_ref, provider_tid)
);

create index if not exists bank_transactions_trdt_idx on public.bank_transactions (trdt desc);
create index if not exists bank_transactions_unposted_idx on public.bank_transactions (trdt desc) where posted_at is null;

-- 입금자 별칭. 계좌 소유주 개인 이름으로 입금하는 업체가 많아서 사장님이 수동으로 등록한다.
-- 업체 1 : 별칭 N. 같은 별칭이 여러 업체에 걸릴 수 있고, 그 경우 자동확정하지 않고 사람이 본다(판정 로직).
create table if not exists public.depositor_aliases (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id),
  alias_raw     text not null,
  alias_norm    text not null check (alias_norm <> ''),
  created_at    timestamptz not null default now(),
  created_by    uuid references public.users(id),
  unique (restaurant_id, alias_norm)
);

create index if not exists depositor_aliases_norm_idx on public.depositor_aliases (alias_norm);

-- 자동매칭 판정 결과(추천). 판정과 실제 수금 반영은 별개다. 거래당 최신 판정 한 건.
create table if not exists public.payment_matches (
  id                  uuid primary key default gen_random_uuid(),
  bank_transaction_id uuid not null unique references public.bank_transactions(id),
  verdict             text not null check (verdict in ('AUTO_MATCH', 'REVIEW', 'UNMATCHED')),
  restaurant_id       uuid references public.restaurants(id),
  candidates          jsonb not null default '[]'::jsonb,
  reasons             text[] not null default '{}',
  rule_version        text not null,
  decided_at          timestamptz not null default now()
);

-- payments 가 어느 은행 거래에서 나왔는지. 한 거래가 여러 미수금에 나뉘어 들어갈 수 있어 유일키는 걸지 않는다.
alter table public.payments add column if not exists bank_transaction_id uuid references public.bank_transactions(id);
create index if not exists payments_bank_transaction_id_idx on public.payments (bank_transaction_id) where bank_transaction_id is not null;

-- RLS 는 켜 두되 정책은 두지 않는다. 읽고 쓰는 것은 service role 뿐이다.
alter table public.bank_transactions enable row level security;
alter table public.depositor_aliases enable row level security;
alter table public.payment_matches   enable row level security;

revoke all on public.bank_transactions from anon, authenticated;
revoke all on public.depositor_aliases from anon, authenticated;
revoke all on public.payment_matches   from anon, authenticated;
