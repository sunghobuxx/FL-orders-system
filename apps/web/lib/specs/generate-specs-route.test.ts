import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/testing/fake-db'

const m = vi.hoisted(() => ({ sync: vi.fn(), settled: vi.fn(), session: vi.fn(), db: null as unknown }))
vi.mock('@/lib/specs/sync', () => ({ syncSpecFromOrders: m.sync }))
vi.mock('@/lib/specs/settled', () => ({ settledSpecIds: m.settled }))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: m.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => m.db }))

async function post(body: unknown) {
  const { POST } = await import('../../app/api/admin/orders/generate-specs/route')
  return POST(new Request('https://x.test', { method: 'POST', body: JSON.stringify(body) }))
}

describe('POST generate-specs (발주 기준 재생성) — 확정·완납된 날짜는 건드리지 않는다', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks()
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    m.sync.mockResolvedValue('spec-x')
    m.db = fakeDb({
      order_batches: [{ id: 'b1', restaurant_id: 'r1' }, { id: 'b2', restaurant_id: 'r2' }],
      restaurants: [{ id: 'r1', organization_id: 'org1' }, { id: 'r2', organization_id: 'org2' }],
      orders: [{ id: 'o1' }],
      daily_specs: [{ id: 's1', restaurant_id: 'r1' }, { id: 's2', restaurant_id: 'r2' }],
    }).db
  })

  it('★ 확정·완납된 정산서에 든 식당은 다시 만들지 않고 건너뛴 곳 수를 알려 준다', async () => {
    m.settled.mockResolvedValue(new Set(['s1']))
    const res = await post({ businessDate: '2026-09-14' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, created: 1, skipped: 1 })
    expect(m.sync).toHaveBeenCalledTimes(1)
    expect(m.sync.mock.calls[0][1]).toMatchObject({ restaurantId: 'r2', businessDate: '2026-09-14' })
  })

  it('잠긴 곳이 없으면 예전처럼 전부 다시 만든다(회귀 없음)', async () => {
    m.settled.mockResolvedValue(new Set())
    const res = await post({ businessDate: '2026-09-25' })
    expect(await res.json()).toEqual({ success: true, created: 2, skipped: 0 })
    expect(m.sync).toHaveBeenCalledTimes(2)
  })

  it('관리자가 아니면 403, 날짜가 없으면 400', async () => {
    m.session.mockResolvedValue(null)
    expect((await post({ businessDate: '2026-09-25' })).status).toBe(403)
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    expect((await post({})).status).toBe(400)
    expect(m.sync).not.toHaveBeenCalled()
  })
})
