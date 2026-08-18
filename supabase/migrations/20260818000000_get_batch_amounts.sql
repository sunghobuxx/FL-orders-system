-- 총주문내역 화면의 「주문금액」.
--
-- 화면이 rpc('get_batch_amounts') 를 부르는데 함수가 DB 에 없었다.
-- supabase 의 .rpc() 는 실패해도 예외를 던지지 않고 data 만 비워서 돌려주므로,
-- 화면에는 아무 오류 없이 **전부 0원**으로 보였다 (2026-08-18 확인).
--
-- 금액 기준은 명세서다. 명세서가 있으면 그 금액(= 실제 청구액, 부가세 포함)을 쓰고,
-- 아직 명세서가 없는 발주만 발주 금액으로 계산한다. 그래야 이 화면 합계가
-- 정산서·미수금과 어긋나지 않는다.
create or replace function public.get_batch_amounts(from_date date, to_date date)
returns table (batch_id uuid, total_amount numeric)
language sql
stable
as $$
  select
    ob.id as batch_id,
    coalesce(
      -- 1) 명세서 금액
      (select ds.total_amount
         from daily_specs ds
        where ds.restaurant_id = ob.restaurant_id
          and ds.business_date = ob.business_date
        limit 1),
      -- 2) 명세서가 없으면 발주 금액
      (select coalesce(sum(oi.qty * oi.unit_price_snapshot), 0)
         from orders o
         join order_items oi on oi.order_id = o.id
        where o.batch_id = ob.id),
      0
    ) as total_amount
  from order_batches ob
  where ob.business_date between from_date and to_date;
$$;

-- service role 로만 부른다 (어드민 화면).
revoke all on function public.get_batch_amounts(date, date) from public;
grant execute on function public.get_batch_amounts(date, date) to service_role;
