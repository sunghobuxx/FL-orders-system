-- 업체 적립금 원장 (초과입금을 버리지 않고 쌓아 두었다가 상계·환불한다).
-- 결정(2026-10-06): 상계는 사장님이 버튼으로 확인해서 하고, 환불도 가능하다. 적용은 앞으로 생기는 입금부터.
-- 미수금(receivables)은 여전히 미수 잔액만 담는다. 적립 잔액은 이 원장의 합계다.
-- amount: 적립은 +, 상계·환불은 -. 0 은 허용하지 않는다.

create table if not exists public.restaurant_credit_ledger (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references public.restaurants(id),
  amount              numeric not null check (amount <> 0),
  kind                text not null check (kind in ('overpay', 'offset', 'refund')),
  bank_transaction_id uuid references public.bank_transactions(id),
  statement_id        uuid references public.sales_statements(id),
  note                text,
  created_by          uuid,
  created_at          timestamptz not null default now()
);

create index if not exists restaurant_credit_ledger_restaurant_idx
  on public.restaurant_credit_ledger (restaurant_id, created_at);

alter table public.restaurant_credit_ledger enable row level security;
