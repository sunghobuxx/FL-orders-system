import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PopbillClient, PopbillError } from './client'

const config = {
  environment: 'test' as const, serviceId: 'POPBILL_TEST' as const,
  authUrl: 'https://auth.linkhub.co.kr', apiBase: 'https://popbill-test.linkhub.co.kr',
  linkId: 'LINK', secretKey: 'dGVzdC1zZWNyZXQta2V5LTAxMjM0NTY3ODlhYmNkZWY=', corpNum: '1234567890',
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const token = (exp: string, t = 'TOKEN-1') => json(200, { session_token: t, expiration: exp, serviceID: 'POPBILL_TEST', userID: '1234567890', scope: ['180'] })

describe('PopbillClient', () => {
  let now = new Date('2026-09-26T05:00:00Z')
  const clock = () => now
  beforeEach(() => { now = new Date('2026-09-26T05:00:00Z') })

  it('★ 토큰을 받아 Bearer 로 호출하고, 만료 전에는 토큰을 다시 받지 않는다', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(token('2026-09-26T05:30:00Z'))
      .mockImplementation(async () => json(200, { ok: 1 }))
    const c = new PopbillClient(config, { fetchFn, now: clock })
    expect(await c.request('GET', '/EasyFinBank/ListBankAccount', { scopes: ['180'] })).toEqual({ ok: 1 })
    await c.request('GET', '/EasyFinBank/ListBankAccount', { scopes: ['180'] })
    expect(fetchFn).toHaveBeenCalledTimes(3) // 토큰 1 + 호출 2
    const [url, init] = fetchFn.mock.calls[1]
    expect(url).toBe('https://popbill-test.linkhub.co.kr/EasyFinBank/ListBankAccount')
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer TOKEN-1' })
  })

  it('토큰 만료 2분 전부터는 새로 받는다(만료 직전에 쓰다 실패하지 않게)', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(token('2026-09-26T05:30:00Z', 'OLD'))
      .mockResolvedValueOnce(json(200, {}))
      .mockResolvedValueOnce(token('2026-09-26T06:00:00Z', 'NEW'))
      .mockResolvedValueOnce(json(200, {}))
    const c = new PopbillClient(config, { fetchFn, now: clock })
    await c.request('GET', '/x', { scopes: ['180'] })
    now = new Date('2026-09-26T05:28:30Z')
    await c.request('GET', '/x', { scopes: ['180'] })
    expect((fetchFn.mock.calls[3][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer NEW' })
  })

  it('범위(scope)가 다르면 토큰도 따로 받는다', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(token('2026-09-26T05:30:00Z', 'A')).mockResolvedValueOnce(json(200, {}))
      .mockResolvedValueOnce(token('2026-09-26T05:30:00Z', 'B')).mockResolvedValueOnce(json(200, {}))
    const c = new PopbillClient(config, { fetchFn, now: clock })
    await c.request('GET', '/a', { scopes: ['180'] })
    await c.request('GET', '/b', { scopes: ['110'] })
    expect(fetchFn.mock.calls.filter(([u]) => String(u).includes('/Token'))).toHaveLength(2)
  })

  it('★ 오류 응답은 PopbillError(status·code·message)로 던지고, 비밀키·토큰은 오류에 넣지 않는다', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(token('2026-09-26T05:30:00Z', 'SECRET-TOKEN-VALUE'))
      .mockResolvedValueOnce(json(400, { code: -32000, message: '계좌 미등록' }))
    const c = new PopbillClient(config, { fetchFn, now: clock })
    const err = await c.request('GET', '/x', { scopes: ['180'] }).catch((e: PopbillError) => e) as PopbillError
    expect(err).toBeInstanceOf(PopbillError)
    expect(err).toMatchObject({ status: 400, code: -32000, message: expect.stringContaining('계좌 미등록'), outcome: 'rejected' })
    expect(String(err.message)).not.toContain('SECRET-TOKEN-VALUE')
    expect(JSON.stringify(err)).not.toContain(config.secretKey)
  })

  it('★ 네트워크 오류나 5xx 는 결과 불명(unknown)으로 표시한다 — 재발송 금지 판단용', async () => {
    const netFail = vi.fn().mockResolvedValueOnce(token('2026-09-26T05:30:00Z')).mockRejectedValueOnce(new TypeError('fetch failed'))
    const e1 = await new PopbillClient(config, { fetchFn: netFail, now: clock }).request('POST', '/x', { scopes: ['180'], body: {} }).catch(e => e)
    expect(e1).toMatchObject({ outcome: 'unknown', status: null })
    const srvFail = vi.fn().mockResolvedValueOnce(token('2026-09-26T05:30:00Z')).mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
    const e2 = await new PopbillClient(config, { fetchFn: srvFail, now: clock }).request('POST', '/x', { scopes: ['180'], body: {} }).catch(e => e)
    expect(e2).toMatchObject({ outcome: 'unknown', status: 502 })
  })

  it('토큰 발급이 실패하면 PopbillError 로 던지고 API 는 부르지 않는다', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(json(401, { code: -10001, message: '인증 실패' }))
    const err = await new PopbillClient(config, { fetchFn, now: clock }).request('GET', '/x', { scopes: ['180'] }).catch((e: PopbillError) => e) as PopbillError
    expect(err).toBeInstanceOf(PopbillError)
    expect(err.status).toBe(401)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('POST 는 본문을 JSON 으로 보낸다', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(token('2026-09-26T05:30:00Z')).mockResolvedValueOnce(json(200, {}))
    await new PopbillClient(config, { fetchFn, now: clock }).request('POST', '/x', { scopes: ['180'], body: { a: 1 } })
    expect((fetchFn.mock.calls[1][1] as RequestInit).body).toBe('{"a":1}')
  })
})
