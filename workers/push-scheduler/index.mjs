const ENDPOINT = 'https://order.fruitlife.shop/api/admin/push/send'

export async function runScheduled(env, request = fetch) {
  if (!env.PUSH_CRON_SECRET) throw new Error('push_scheduler_secret_missing')
  // API owns KST dates, configured times and the atomic daily send claim.
  const response = await request(ENDPOINT, {
    method: 'POST', redirect: 'manual',
    headers: { Authorization: `Bearer ${env.PUSH_CRON_SECRET}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(25000),
  })
  if (!response.ok) throw new Error(`push_scheduler_http_${response.status}`)
  const result = await response.json()
  if (!Number.isInteger(result.accepted) || result.accepted < 0 || !Array.isArray(result.results)) throw new Error('push_scheduler_invalid_response')
  // Never log credentials, tokens or message contents.
  return { accepted: result.accepted, time: result.time }
}

export default {
  async scheduled(event, env) {
    const result = await runScheduled(env)
    console.log(JSON.stringify({ event: 'push_schedule_checked', scheduledAt: new Date(event.scheduledTime).toISOString(), ...result }))
  },
  fetch() { return new Response('Not found', { status: 404 }) },
}
