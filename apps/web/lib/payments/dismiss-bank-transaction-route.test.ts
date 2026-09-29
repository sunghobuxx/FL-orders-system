import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/testing/fake-db'

const mocks = vi.hoisted(() => ({ session: vi.fn() }))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: mocks.session }))

async function post(db: unknown, body: unknown) {
  mocks.session.mockResolvedValue({ user: { id: 'admin-1' }, db })
  const { POST } = await import('../../app/api/admin/finance/dismiss-bank-transaction/route')
  return POST(new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) }) as never)
}

const txRow = (over: Record<string, unknown> = {}) => ({ id: 'bt-1', direction: 'in', posted_at: null, ...over })

describe('POST /api/admin/finance/dismiss-bank-transaction — 이미 손으로 처리한 입금을 목록에서 건너뛴다', () => {
  beforeEach(() => vi.clearAllMocks())

  it('★ 아직 반영 안 된 거래는 posted_at 만 찍고 업체는 연결하지 않는다(돈을 움직이지 않는다)', async () => {
    const f = fakeDb({ bank_transactions: [txRow()] })
    const res = await post(f.db, { bankTransactionId: 'bt-1' })
    expect(res.status).toBe(200)
    const w = f.writes.find(w => w.table === 'bank_transactions' && w.op === 'update')!
    expect(w.payload).toMatchObject({ posted_restaurant_id: null, posted_by: 'admin-1' })
    expect(w.payload).toHaveProperty('posted_at')
  })

  it('id 가 없으면 400, DB 를 건드리지 않는다', async () => {
    const f = fakeDb({ bank_transactions: [txRow()] })
    expect((await post(f.db, {})).status).toBe(400)
    expect(f.writes).toEqual([])
  })

  it('관리자가 아니면 403', async () => {
    mocks.session.mockResolvedValue(null)
    const { POST } = await import('../../app/api/admin/finance/dismiss-bank-transaction/route')
    const res = await POST(new Request('https://x.test', { method: 'POST', body: JSON.stringify({ bankTransactionId: 'bt-1' }) }) as never)
    expect(res.status).toBe(403)
  })

  it('거래를 찾을 수 없으면 404', async () => {
    const f = fakeDb({ bank_transactions: [] })
    expect((await post(f.db, { bankTransactionId: 'bt-x' })).status).toBe(404)
  })

  it('이미 확정·건너뛴 거래를 다시 누르면 그대로 성공(중복 클릭 방지), 다시 쓰지 않는다', async () => {
    const f = fakeDb({ bank_transactions: [txRow({ posted_at: '2026-09-29T00:00:00Z' })] })
    const res = await post(f.db, { bankTransactionId: 'bt-1' })
    expect(res.status).toBe(200)
    expect(f.writes.find(w => w.table === 'bank_transactions' && w.op === 'update')).toBeUndefined()
  })

  it('출금 거래는 건너뛸 필요가 없다(입금만 목록에 뜨므로) — 400', async () => {
    const f = fakeDb({ bank_transactions: [txRow({ direction: 'out' })] })
    expect((await post(f.db, { bankTransactionId: 'bt-1' })).status).toBe(400)
  })
})
