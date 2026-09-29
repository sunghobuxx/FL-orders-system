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
  id: 'bt-1', direction: 'in', amount: 48000, posted_at: null, posted_restaurant_id: null,
  depositor_raw: '박창민(할매솥뚜껑삼', depositor_norm: '박창민할매솥뚜껑삼', ...over,
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

  describe('업체 확정 → 입금자 별칭 자동 등록 (2026-09-29 사장님 요청: 두 화면이 서로 안 맞음)', () => {
    it('★ 처음 확정되면 그 입금자명을 업체 별칭으로 등록한다 — 다음엔 자동 추천되도록', async () => {
      const f = fakeDb({ bank_transactions: [txRow()], depositor_aliases: [] })
      ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: { applied: 48000, updated_count: 1, leftover: 0, already_posted: false }, error: null })
      await post(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1' })
      const w = f.writes.find(w => w.table === 'depositor_aliases' && w.op === 'insert')!
      expect(w.payload).toMatchObject({
        restaurant_id: 'r1', alias_raw: '박창민(할매솥뚜껑삼', alias_norm: '박창민할매솥뚜껑삼', created_by: 'admin-1',
      })
    })

    it('이미 이 업체에 같은 별칭이 등록돼 있으면(중복키) 조용히 넘어가고 확정 자체는 성공한다', async () => {
      const f = fakeDb({ bank_transactions: [txRow()] }, { errors: { 'depositor_aliases:insert': { message: 'duplicate key value violates unique constraint', code: '23505' } } })
      ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: { applied: 48000, updated_count: 1, leftover: 0, already_posted: false }, error: null })
      const res = await post(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1' })
      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)
    })

    it('입금자명이 없으면(이자 입금 등) 별칭을 등록하지 않는다', async () => {
      const f = fakeDb({ bank_transactions: [txRow({ depositor_raw: null, depositor_norm: null })] })
      ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: { applied: 48000, updated_count: 1, leftover: 0, already_posted: false }, error: null })
      await post(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1' })
      expect(f.writes.find(w => w.table === 'depositor_aliases')).toBeUndefined()
    })

    it('중복 클릭(이미 반영된 같은 업체)이면 별칭을 다시 등록하려 하지 않는다', async () => {
      const f = fakeDb({ bank_transactions: [txRow({ posted_at: '2026-09-29T00:00:00Z', posted_restaurant_id: 'r1' })] })
      ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: { applied: 0, updated_count: 0, leftover: 0, already_posted: true }, error: null })
      await post(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1' })
      expect(f.writes.find(w => w.table === 'depositor_aliases')).toBeUndefined()
    })

    it('초과입금 등으로 확정이 실패하면 별칭도 등록하지 않는다', async () => {
      const f = fakeDb({ bank_transactions: [txRow()] })
      ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'OVERPAY', details: '30000' } })
      await post(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1' })
      expect(f.writes.find(w => w.table === 'depositor_aliases')).toBeUndefined()
    })
  })
})
