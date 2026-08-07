-- 가락시장 경매 실적을 매일 20:00 KST 에 수집한다.
--
-- 20:00 인 이유: 경매는 오전에 끝난다. 저녁에 부르면 그날 자료가 온전하다.
-- 낮에 부르면 그날치가 반쯤 찬 상태로 저장되고, 다음 날 다시 부르지 않으면 그대로 남는다.
--
-- collect 는 (trade_date, market_code, mclsf_name, unit_name) 으로 upsert 하므로
-- 같은 날짜를 여러 번 불러도 안전하다. 빠진 날은 date 를 주고 다시 부르면 메워진다.
--
-- 하루 3~4만 건을 페이지당 1000건씩 받아 집계하므로 timeout 을 300초로 둔다.
--
-- 2026-08-04 무렵 DB 에 직접 걸어 두었고 마이그레이션이 없었다. 그래서 리포만 봐서는
-- 이 수집이 언제 도는지 알 수가 없었다. 이 파일은 그 스케줄을 리포에 남겨 두는 것이다.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('market-collect-2000-kst')
where exists (select 1 from cron.job where jobname = 'market-collect-2000-kst');

-- 11:00 UTC = 20:00 KST
select cron.schedule(
  'market-collect-2000-kst',
  '0 11 * * *',
  $$
  select net.http_post(
    url := 'https://order.fruitlife.shop/api/admin/market/collect',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'push_cron_secret'
      )
    ),
    body := jsonb_build_object(
      'date', to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD')
    ),
    timeout_milliseconds := 300000
  );
  $$
);
