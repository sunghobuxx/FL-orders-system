import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/testing/fake-db'

const mocks = vi.hoisted(() => ({ session: vi.fn() }))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: mocks.session }))

async function post(db: unknown, body: unknown) {
  mocks.session.mockResolvedValue({ user: { id: 'admin-1' }, db })
  const { POST } = await import('../../app/api/admin/finance/confirm-bank-transaction/route')
  return POST(new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) }) as never)
}

const txRow = (over: Record<string, unknown> = {}) => ({
  id: 'bt-1', direction: 'in', amount: 48000, posted_at: null, posted_restaurant_id: null, ...over,
})

describe('POST /api/admin/finance/confirm-bank-transaction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('★ 관리자가 업체를 골라 확정하면 은행 거래 id 로 record_receivable_payment 를 부른다', async () => {
    const f = fakeDb({ bank_transactions: [txRow()] }, { errors: {} })
    ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: { applied: 48000, updated_count: 1, leftover: 0, already_posted: false }, error: null })
    const res = await post(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, applied: 48000, updatedCount: 1, alreadyPosted: false })
    expect((f.db as any).rpc).toHaveBeenCalledWith('record_receivable_payment', {
      p_restaurant_id: 'r1', p_amount: 48000, p_method: 'transfer', p_paid_at: undefined,
      p_created_by: 'admin-1', p_bank_transaction_id: 'bt-1',
    })
  })

  it('필수 값이 없으면 400, DB 를 건드리지 않는다', async () => {
    const f = fakeDb({ bank_transactions: [txRow()] })
    ;(f.db as any).rpc = vi.fn()
    expect((await post(f.db, { bankTransactionId: 'bt-1' })).status).toBe(400)
    expect((await post(f.db, { restaurantId: 'r1' })).status).toBe(400)
    expect((f.db as any).rpc).not.toHaveBeenCalled()
  })

  it('관리자가 아니면 403', async () => {
    mocks.session.mockResolvedValue(null)
    const { POST } = await import('../../app/api/admin/finance/confirm-bank-transaction/route')
    const res = await POST(new Request('https://x.test', { method: 'POST', body: JSON.stringify({ bankTransactionId: 'bt-1', restaurantId: 'r1' }) }) as never)
    expect(res.status).toBe(403)
  })

  it('은행 거래를 찾을 수 없으면 404', async () => {
    const f = fakeDb({ bank_transactions: [] })
    const res = await post(f.db, { bankTransactionId: 'bt-x', restaurantId: 'r1' })
    expect(res.status).toBe(404)
  })

  it('이미 다른 업체로 반영된 거래는 409 — 자동으로 업체를 바꾸지 않는다', async () => {
    const f = fakeDb({ bank_transactions: [txRow({ posted_at: '2026-09-29T00:00:00Z', posted_restaurant_id: 'r2' })] })
    ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: { applied: 0, updated_count: 0, leftover: 0, already_posted: true }, error: null })
    const res = await post(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('이미')
  })

  it('같은 업체로 이미 반영된 거래를 다시 누르면 성공으로 응답한다(중복 클릭 방지)', async () => {
    const f = fakeDb({ bank_transactions: [txRow({ posted_at: '2026-09-29T00:00:00Z', posted_restaurant_id: 'r1' })] })
    ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: { applied: 0, updated_count: 0, leftover: 0, already_posted: true }, error: null })
    const res = await post(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1' })
    expect(res.status).toBe(200)
    expect((await res.json()).alreadyPosted).toBe(true)
  })

  it('출금 거래는 확정할 수 없다(400)', async () => {
    const f = fakeDb({ bank_transactions: [txRow({ direction: 'out' })] })
    const res = await post(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1' })
    expect(res.status).toBe(400)
  })

  it('초과입금이면 400 과 미수금 안내 문구', async () => {
    const f = fakeDb({ bank_transactions: [txRow()] })
    ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'OVERPAY', details: '30000' } })
    const res = await post(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('30,000원')
  })

  it('미수금이 없는 업체를 고르면 404', async () => {
    const f = fakeDb({ bank_transactions: [txRow()] })
    ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'NO_RECEIVABLES' } })
    const res = await post(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1' })
    expect(res.status).toBe(404)
  })

  it('그 밖의 DB 오류는 500 이고 내용을 화면에 내보내지 않는다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = fakeDb({ bank_transactions: [txRow()] })
    ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'secret detail' } })
    const res = await post(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1' })
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret detail')
    spy.mockRestore()
  })
})
