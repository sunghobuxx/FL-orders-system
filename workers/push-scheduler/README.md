# Push scheduler

Cloudflare Cron calls the existing production push API every minute. The API, not
the Worker, evaluates Asia/Seoul reservation times and claims each daily send.
No public HTTP invocation route is exposed. `PUSH_CRON_SECRET` must be registered
as a Worker secret; never commit its value or print it in logs.

Test: `node --test workers/push-scheduler/index.test.mjs`

From apps/web: `pnpm exec wrangler deploy --config ../../workers/push-scheduler/wrangler.toml`

Inspect: `pnpm exec wrangler tail --config ../../workers/push-scheduler/wrangler.toml --format json`
Successful scheduled invocations log `push_schedule_checked` with the API's KST
time and accepted count (acceptance is not proof of device display).

GitHub push-notify workflow is manual-only after cutover. To stop this scheduler,
set crons=[] and deploy. Do not reset daily last_sent_at to test: that can resend
real notifications. Worker scheduling and APNs/FCM delivery are not exact-time SLAs.
