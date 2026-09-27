import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker, { runScheduled } from './index.mjs'

test('calls fixed production endpoint and returns safe metadata', async () => {
  const result = await runScheduled({ PUSH_CRON_SECRET: 'test' }, async (url, options) => {
    assert.equal(url, 'https://order.fruitlife.shop/api/admin/push/send')
    assert.equal(options.headers.Authorization, 'Bearer test')
    assert.equal(options.redirect, 'manual')
    assert.equal(options.method, 'POST')
    return Response.json({ accepted: 0, time: '01:00', results: [], ticketIds: ['private'] })
  })
  assert.deepEqual(result, { accepted: 0, time: '01:00' })
})
test('missing secret never calls API', async () => {
  await assert.rejects(runScheduled({}, () => assert.fail()), /secret_missing/)
})
test('HTTP and malformed responses fail visibly', async () => {
  await assert.rejects(runScheduled({ PUSH_CRON_SECRET: 'test' }, async () => new Response('', { status: 302 })), /http_302/)
  await assert.rejects(runScheduled({ PUSH_CRON_SECRET: 'test' }, async () => new Response('', { status: 401 })), /http_401/)
  await assert.rejects(runScheduled({ PUSH_CRON_SECRET: 'test' }, async () => Response.json({ sent: 0 })), /invalid_response/)
})
test('network failure is not retried within invocation', async () => {
  let calls = 0
  await assert.rejects(runScheduled({ PUSH_CRON_SECRET: 'test' }, async () => { calls++; throw Error('offline') }))
  assert.equal(calls, 1)
})
test('HTTP cannot trigger a send', () => assert.equal(worker.fetch().status, 404))
