-- 발주는 있는데 명세서가 없는 날을 매시간 주워 담는다.
--
-- 명세서는 그동안 발주가 웹 API 를 지날 때만 만들어졌다. 출시된 모바일 앱은 Supabase 에
-- 직접 쓰기 때문에 그 경로를 지나지 않고, 그래서 명세서가 아예 만들어지지 않았다.
-- 2026-08-07 확인: 8/3~8/7 에 8건 1,016,000원어치 누락. 월미당·안산선부점은 그 주
-- 정산서 자체가 없어 청구가 통째로 빠져 있었다.
--
-- 매시간인 이유: 앱 발주는 하루 종일 들어온다. 하루 한 번이면 최대 24시간 동안
-- "발주는 있는데 명세서가 없는" 상태로 남는다. 빠진 게 없으면 조회 두 번으로 끝나므로
-- 자주 돌아도 부담이 없다.
--
-- :20 인 이유: 02:30 자동발주와 04:00 정산서 생성 사이(03:20)에 한 번 지나가야
-- 그날 정산서가 온전한 명세서 위에서 만들어진다.
--
-- 없는 명세서만 만든다. 이미 있는 것은 건드리지 않으므로 관리자가 손으로 고친
-- 수량·단가를 덮어쓰지 않는다.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('spec-sweep-hourly')
where exists (select 1 from cron.job where jobname = 'spec-sweep-hourly');

select cron.schedule(
  'spec-sweep-hourly',
  '20 * * * *',
  $$
  select net.http_post(
    url := 'https://order.fruitlife.shop/api/admin/orders/sweep-specs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'push_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
