-- 발주 문자를 매일 02:30 KST 정각에 발송한다.
--
-- GitHub Actions 의 schedule 은 예약 시각에서 30~90분씩 밀린다. 실측:
--   7/25 03:29 / 7/26 03:34 / 7/27 03:58 / 7/28 04:01 (KST)
-- 공급처가 새벽 4시에 문자를 받고 있었다. DB 에서 직접 호출하면 시각이 정확하다.
--
-- GitHub 워크플로는 지우지 않고 뒷받침으로 남긴다. 늦게 돌더라도
-- auto-dispatch 가 dispatch_messages 를 보고 이미 발송된 job 은 건너뛴다.
-- (그 판단이 되려면 2026-07-29 의 channel 수정이 함께 있어야 한다.
--  기록이 안 남던 동안에는 중복 발송을 막지 못했다.)
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('auto-dispatch-0230-kst')
where exists (select 1 from cron.job where jobname = 'auto-dispatch-0230-kst');

-- 17:30 UTC = 02:30 KST (다음 날). businessDate 는 그 시점의 KST 날짜.
select cron.schedule(
  'auto-dispatch-0230-kst',
  '30 17 * * *',
  $$
  select net.http_post(
    url := 'https://order.fruitlife.shop/api/admin/orders/auto-dispatch',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'businessDate',
      to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD')
    ),
    timeout_milliseconds := 60000
  );
  $$
);
