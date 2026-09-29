-- 팝빌 계좌조회 수집을 30분마다 돌린다.
--
-- /api/admin/bank-sync/collect 가 등록된 계좌(state=1)를 모두 훑어 최근 3일치 거래를
-- 겹쳐서 재조회하고, tid 기준 unique 제약(+ignoreDuplicates)이 중복 저장을 막는다.
-- 계좌 하나가 실패해도 나머지 계좌는 계속 수집한다(라우트 안에서 계좌별로 실패를 격리).
--
-- 30분인 이유: 계좌조회는 정액제라 자주 불러도 추가 비용이 없다(견적서 기준). 겹쳐 재조회하므로
-- 한 번 실패해도 다음 회차가 같은 기간을 다시 채운다.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('bank-sync-collect-30min')
where exists (select 1 from cron.job where jobname = 'bank-sync-collect-30min');

select cron.schedule(
  'bank-sync-collect-30min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://order.fruitlife.shop/api/admin/bank-sync/collect',
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
