import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  session: vi.fn(), db: null as unknown,
  listBankAccounts: vi.fn(), collect: vi.fn(), loadConfig: vi.fn(), autoMatch: vi.fn(),
}))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: m.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => m.db }))
vi.mock('@/lib/popbill/config', () => ({ loadPopbillConfig: m.loadConfig }))
vi.mock('@/lib/popbill/client', () => ({ PopbillClient: class { constructor() {} } }))
vi.mock('@/lib/popbill/easyfinbank', () => ({ listBankAccounts: m.listBankAccounts }))
vi.mock('@/lib/popbill/collect', () => ({ collectBankTransactions: m.collect }))
// runAutoMatch 자체는 lib/payments/auto-match.test.ts 에서 검증한다. 여기서는 이 라우트가 그 결과를
// mode 를 넘겨 부르고 응답에 그대로 싣는지만 본다 — parseAutoMatchMode 는 실제 함수를 그대로 쓴다.
vi.mock('@/lib/payments/auto-match', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/payments/auto-match')>()
  return { ...actual, runAutoMatch: m.autoMatch }
})

const OLD_ENV = process.env
async function post(headers: Record<string, string> = {}) {
  const { POST } = await import('../../app/api/admin/bank-sync/collect/route')
  return POST(new Request('https://x.test', { method: 'POST', headers }) as never)
}

describe('POST /api/admin/bank-sync/collect', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks()
    process.env = { ...OLD_ENV, PUSH_CRON_SECRET: 'cron-secret' }
    m.loadConfig.mockReturnValue({ environment: 'test' })
    m.listBankAccounts.mockResolvedValue([
      { bankCode: '0011', accountNumber: '3011599770921', state: 1 },
      { bankCode: '0011', accountNumber: '9990001112223', state: 0 },
    ])
    m.collect.mockResolvedValue({ jobId: 'j1', fetched: 3, saved: 2 })
    m.autoMatch.mockResolvedValue({ mode: 'off', evaluated: 0, autoMatched: 0, applied: 0, errors: [] })
  })

  it('★ 크론 비밀키로 부르면 활성 계좌만 골라 수집하고 계좌별 결과를 돌려준다', async () => {
    const res = await post({ Authorization: 'Bearer cron-secret' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      success: true,
      results: [{ accountRef: '0011-0921', jobId: 'j1', fetched: 3, saved: 2, error: null }],
      autoMatch: { mode: 'off', evaluated: 0, autoMatched: 0, applied: 0, errors: [] },
    })
    expect(m.collect).toHaveBeenCalledTimes(1)
    expect(m.collect.mock.calls[0][2]).toMatchObject({ accountRef: '0011-0921', bankCode: '0011', accountNumber: '3011599770921' })
  })

  it('수집이 끝나면 자동매칭 배치를 PAYMENT_AUTO_MATCH_MODE 로 부르고 결과를 응답에 싣는다', async () => {
    process.env.PAYMENT_AUTO_MATCH_MODE = 'shadow'
    m.autoMatch.mockResolvedValue({ mode: 'shadow', evaluated: 2, autoMatched: 1, applied: 0, errors: [] })
    const res = await post({ Authorization: 'Bearer cron-secret' })
    const body = await res.json()
    expect(body.autoMatch).toEqual({ mode: 'shadow', evaluated: 2, autoMatched: 1, applied: 0, errors: [] })
    expect(m.autoMatch).toHaveBeenCalledWith(m.db, 'shadow')
  })

  it('로그인한 관리자도 부를 수 있다', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    expect((await post({})).status).toBe(200)
  })

  it('비밀키도 없고 관리자도 아니면 403', async () => {
    m.session.mockResolvedValue(null)
    const res = await post({})
    expect(res.status).toBe(403)
    expect(m.collect).not.toHaveBeenCalled()
  })

  it('한 계좌가 실패해도 나머지는 계속 수집하고, 실패 계좌는 error 로 표시한다', async () => {
    m.listBankAccounts.mockResolvedValue([
      { bankCode: '0011', accountNumber: '1111111111111', state: 1 },
      { bankCode: '0004', accountNumber: '2222222222222', state: 1 },
    ])
    m.collect.mockRejectedValueOnce(new Error('계좌 오류')).mockResolvedValueOnce({ jobId: 'j2', fetched: 1, saved: 1 })
    const res = await post({ Authorization: 'Bearer cron-secret' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toEqual([
      { accountRef: '0011-1111', jobId: null, fetched: 0, saved: 0, error: '계좌 오류' },
      { accountRef: '0004-2222', jobId: 'j2', fetched: 1, saved: 1, error: null },
    ])
  })

  it('등록된 계좌가 없으면 빈 목록으로 성공', async () => {
    m.listBankAccounts.mockResolvedValue([])
    const res = await post({ Authorization: 'Bearer cron-secret' })
    expect(await res.json()).toEqual({
      success: true, results: [], autoMatch: { mode: 'off', evaluated: 0, autoMatched: 0, applied: 0, errors: [] },
    })
  })
})
