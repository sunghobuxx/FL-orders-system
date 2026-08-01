-- 정산서를 매일 04:00 KST 에 만들고 갱신한다.
--
-- 그동안 정산서를 만드는 경로가 두 개(generateStatements, periods/[id]/calculate)
-- 였는데 둘 다 사람이 눌러야만 돌았다. 그래서 진행 중인 주는 정산서가 아예 없었고,
-- 화면에서 "그 주의 내역" 이 보이지 않았다. (2026-08-01 확인: 07-27~08-02 기간의
-- 명세서 84건 9,453,006원이 쌓여 있는데 정산서 0건)
--
-- force=true 로 부른다. 기간 종료일이 아니어도 그 시점까지의 금액으로 만들라는 뜻이다.
-- 대상은 businessDate 가 속한 현재 기간뿐이라 지난 기간·완납 건은 건드리지 않는다.
--
-- 04:00 인 이유: 명세서는 전날 저녁부터 당일 새벽 3시대까지 만들어진다.
-- 02:30 발주 자동발송과 늦은 추가발주가 끝난 뒤라야 그날 금액이 온전하다.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('settlement-generate-0400-kst')
where exists (select 1 from cron.job where jobname = 'settlement-generate-0400-kst');

-- 19:00 UTC = 04:00 KST (다음 날)
select cron.schedule(
  'settlement-generate-0400-kst',
  '0 19 * * *',
  $$
  select net.http_post(
    url := 'https://order.fruitlife.shop/api/admin/settlement/generate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'push_cron_secret'
      )
    ),
    body := jsonb_build_object(
      'businessDate',
      to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD'),
      'force', true
    ),
    timeout_milliseconds := 120000
  );
  $$
);
