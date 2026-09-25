import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: mocks.session }))

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-25T03:00:00Z')) // KST 2026-09-25 12:00
  mocks.session.mockResolvedValue({ user: { id: 'admin-1' }, db: { rpc: mocks.rpc } })
  mocks.rpc.mockResolvedValue({ data: { applied: 150000, updated_count: 2, leftover: 0, already_posted: false }, error: null })
})
afterEach(() => vi.useRealTimers())

async function post(body: unknown) {
  const { POST } = await import('../../app/api/admin/finance/record-payment/route')
  return POST(new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) }) as never)
}
const ok = { restaurantId: 'rest-1', amount: 150000, method: 'transfer' }

describe('POST /api/admin/finance/record-payment', () => {
  it('업체나 금액이 없으면 400, DB 를 건드리지 않는다', async () => {
    expect((await post({ amount: 1000, method: 'cash' })).status).toBe(400)
    expect((await post({ restaurantId: 'rest-1', amount: 0, method: 'cash' })).status).toBe(400)
    expect((await post({ restaurantId: 'rest-1', amount: -5, method: 'cash' })).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('입금일 형식이 틀리거나 미래(KST)면 400', async () => {
    expect((await post({ ...ok, paidOn: '2026-9-24' })).status).toBe(400)
    const future = await post({ ...ok, paidOn: '2026-09-26' })
    expect(future.status).toBe(400)
    expect((await future.json()).error).toContain('미래')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('관리자가 아니면 403, DB 를 건드리지 않는다', async () => {
    mocks.session.mockResolvedValue(null)
    expect((await post(ok)).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('성공하면 DB 함수를 부르고 예전과 같은 모양으로 응답한다 — created_by 는 관리자 id', async () => {
    const res = await post({ ...ok, paidOn: '2026-09-24' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, applied: 150000, leftover: 0, updatedCount: 2 })
    expect(mocks.rpc).toHaveBeenCalledWith('record_receivable_payment', {
      p_restaurant_id: 'rest-1', p_amount: 150000, p_method: 'transfer',
      p_paid_at: '2026-09-24T09:00:00+09:00', p_created_by: 'admin-1', p_bank_transaction_id: null,
    })
  })

  it('입금일이 없으면 지금 시각, 방법이 없으면 cash 로 기록한다', async () => {
    await post({ restaurantId: 'rest-1', amount: 1000 })
    expect(mocks.rpc).toHaveBeenCalledWith('record_receivable_payment', expect.objectContaining({
      p_method: 'cash', p_paid_at: '2026-09-25T03:00:00.000Z',
    }))
  })

  it('미수금이 없으면 404 와 예전 문구', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'NO_RECEIVABLES' } })
    const res = await post(ok)
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('미수금 내역이 없습니다.')
  })

  it('초과입금이면 400 과 예전 문구(현재 미수금·입력액·붙일 곳 없는 금액)', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'OVERPAY', details: '30000' } })
    const res = await post({ ...ok, amount: 30001 })
    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error).toContain('현재 미수금은 30,000원인데 30,001원이 입력됐습니다.')
    expect(error).toContain('1원은 붙일 곳이 없어 기록되지 않습니다.')
    expect(error).toContain('지금 넣으시려면 30,000원까지만 됩니다.')
  })

  it('알 수 없는 방법은 400 (예전에는 500)', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'INVALID_METHOD' } })
    expect((await post({ ...ok, method: 'bitcoin' })).status).toBe(400)
  })

  it('그 밖의 DB 오류는 500 이고 오류 내용을 화면에 내보내지 않는다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'secret detail' } })
    const res = await post(ok)
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret detail')
    spy.mockRestore()
  })

  it('요청 본문이 JSON 이 아니면 500 이 아니라 오류 응답을 낸다(서버가 죽지 않는다)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { POST } = await import('../../app/api/admin/finance/record-payment/route')
    const res = await POST(new Request('https://example.test', { method: 'POST', body: 'not json' }) as never)
    expect(res.status).toBeGreaterThanOrEqual(400)
    spy.mockRestore()
  })
})
