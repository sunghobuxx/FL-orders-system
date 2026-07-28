-- 발주 문자에만 적용되는 수량 수정.
--
-- dispatch_job_items.qty 는 발송 직전 syncDispatchJobItems 가 order_items.qty 로
-- 매번 덮어쓴다. 그래서 "문자에만 반영할 수량"을 둘 자리가 없었다.
-- 이 플래그가 켜진 줄은 sync 가 수량을 건드리지 않는다.
-- is_excluded(수동 제외) 와 같은 성격이다.
alter table public.dispatch_job_items
  add column if not exists qty_overridden boolean not null default false;

notify pgrst, 'reload schema';
