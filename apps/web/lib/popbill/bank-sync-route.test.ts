import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  session: vi.fn(), db: null as unknown,
  listBankAccounts: vi.fn(), collect: vi.fn(), loadConfig: vi.fn(),
}))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: m.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => m.db }))
vi.mock('@/lib/popbill/config', () => ({ loadPopbillConfig: m.loadConfig }))
vi.mock('@/lib/popbill/client', () => ({ PopbillClient: class { constructor() {} } }))
vi.mock('@/lib/popbill/easyfinbank', () => ({ listBankAccounts: m.listBankAccounts }))
vi.mock('@/lib/popbill/collect', () => ({ collectBankTransactions: m.collect }))

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
      { accountID: 'acc-1', bankCode: '0011', accountNumber: '111', state: 1 },
      { accountID: 'acc-closed', bankCode: '0011', accountNumber: '222', state: 0 },
    ])
    m.collect.mockResolvedValue({ jobId: 'j1', fetched: 3, saved: 2 })
  })

  it('★ 크론 비밀키로 부르면 활성 계좌만 골라 수집하고 계좌별 결과를 돌려준다', async () => {
    const res = await post({ Authorization: 'Bearer cron-secret' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, results: [{ accountRef: 'acc-1', jobId: 'j1', fetched: 3, saved: 2, error: null }] })
    expect(m.collect).toHaveBeenCalledTimes(1)
    expect(m.collect.mock.calls[0][2]).toMatchObject({ accountRef: 'acc-1', bankCode: '0011', accountNumber: '111' })
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
      { accountID: 'acc-1', bankCode: '0011', accountNumber: '111', state: 1 },
      { accountID: 'acc-2', bankCode: '0011', accountNumber: '222', state: 1 },
    ])
    m.collect.mockRejectedValueOnce(new Error('계좌 오류')).mockResolvedValueOnce({ jobId: 'j2', fetched: 1, saved: 1 })
    const res = await post({ Authorization: 'Bearer cron-secret' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toEqual([
      { accountRef: 'acc-1', jobId: null, fetched: 0, saved: 0, error: '계좌 오류' },
      { accountRef: 'acc-2', jobId: 'j2', fetched: 1, saved: 1, error: null },
    ])
  })

  it('등록된 계좌가 없으면 빈 목록으로 성공', async () => {
    m.listBankAccounts.mockResolvedValue([])
    const res = await post({ Authorization: 'Bearer cron-secret' })
    expect(await res.json()).toEqual({ success: true, results: [] })
  })
})
