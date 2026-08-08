-- 발주 품목 확인 단계.
--   0 = 미확인
--   1 = 상차 확인  (전 품목이 1 이 되면 배치가 ordered = 배송중)
--   2 = 배송 확인  (전 품목이 2 가 되면 배치가 dispatched = 배송완료)
--
-- 그동안 확인 상태는 브라우저 localStorage 에 있었다. 그래서 확인을 해도 어드민 목록·
-- 회원 진행상황·공급처별 발주 내역 어디에도 반영되지 않았고, 다른 기기에서 열면 처음
-- 상태로 보였다.
--
-- 단계를 두 칸으로 나눈 이유: 한 바퀴 다 확인하면 배송중으로 넘어가고 버튼이 다시
-- «확인» 으로 돌아가야 한다. 필요 단계(1 또는 2)를 배치 상태에서 정하므로 값을 지우지
-- 않아도 버튼이 저절로 되살아난다.

alter table public.order_items
  add column if not exists check_stage smallint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_items_check_stage_check'
  ) then
    alter table public.order_items
      add constraint order_items_check_stage_check check (check_stage between 0 and 2);
  end if;
end $$;

-- 이미 배송완료·완료로 끝난 발주는 두 단계를 다 지난 것으로 본다.
-- 이걸 안 맞춰 두면 지난 발주를 열었을 때 확인이 하나도 안 된 것처럼 보인다.
update public.order_items oi
set check_stage = 2
from orders o
join order_batches ob on ob.id = o.batch_id
where o.id = oi.order_id
  and ob.status in ('dispatched', 'completed')
  and oi.check_stage < 2;

update public.order_items oi
set check_stage = 1
from orders o
join order_batches ob on ob.id = o.batch_id
where o.id = oi.order_id
  and ob.status = 'ordered'
  and oi.check_stage < 1;

create index if not exists order_items_order_check_idx
  on public.order_items (order_id, check_stage);
