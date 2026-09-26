import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/testing/fake-db'

const m = vi.hoisted(() => ({ clean: vi.fn(), db: null as unknown, session: vi.fn(), sessionUser: vi.fn() }))
vi.mock('@/lib/specs/cleanup-deleted-batch', () => ({ cleanSpecAfterBatchDelete: m.clean }))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: m.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => m.db }))
vi.mock('@/lib/supabase/server', () => ({ getSessionUser: m.sessionUser }))

const tables = () => ({
  order_batches: [{ id: 'b1', restaurant_id: 'r1', business_date: '2026-09-21', status: 'submitted' }],
  orders: [{ id: 'o1' }],
  order_items: [{ id: 'oi1', product_id: 'p1' }, { id: 'oi2', product_id: 'p2' }],
})

describe('발주 삭제 — 명세서·정산서도 함께 정리한다', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks()
    m.clean.mockResolvedValue({ status: 'cleaned', removedLines: 2, removedSpec: true })
  })

  it('★ 어드민 삭제: 지우는 발주의 식당·날짜·품목으로 명세서 정리를 부르고, 발주는 그대로 삭제한다', async () => {
    const f = fakeDb(tables()); m.db = f.db
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const { DELETE } = await import('../../app/api/admin/orders/[batchId]/route')
    const res = await DELETE(new Request('https://x.test') as never, { params: Promise.resolve({ batchId: 'b1' }) })
    expect(res.status).toBe(200)
    expect(m.clean).toHaveBeenCalledWith(f.db, {
      restaurantId: 'r1', businessDate: '2026-09-21', itemIds: ['oi1', 'oi2'], productIds: ['p1', 'p2'],
    })
    expect(f.writes.some(w => w.table === 'order_batches' && w.op === 'delete')).toBe(true)
    expect(f.writes.some(w => w.table === 'order_items' && w.op === 'delete')).toBe(true)
  })

  it('명세서 정리가 실패해도 발주 삭제는 끝까지 간다(로그만 남긴다)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.clean.mockRejectedValue(new Error('boom'))
    const f = fakeDb(tables()); m.db = f.db
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const { DELETE } = await import('../../app/api/admin/orders/[batchId]/route')
    const res = await DELETE(new Request('https://x.test') as never, { params: Promise.resolve({ batchId: 'b1' }) })
    expect(res.status).toBe(200)
    expect(f.writes.some(w => w.table === 'order_batches' && w.op === 'delete')).toBe(true)
    spy.mockRestore()
  })

  it('관리자가 아니면 403 이고 아무것도 정리하지 않는다', async () => {
    m.db = fakeDb(tables()).db
    m.session.mockResolvedValue(null)
    const { DELETE } = await import('../../app/api/admin/orders/[batchId]/route')
    const res = await DELETE(new Request('https://x.test') as never, { params: Promise.resolve({ batchId: 'b1' }) })
    expect(res.status).toBe(403)
    expect(m.clean).not.toHaveBeenCalled()
  })

  it('★ 회원 삭제: 관리자 클라이언트로 명세서를 정리하고, 회원 클라이언트로 발주를 지운다', async () => {
    const admin = fakeDb({}); m.db = admin.db
    const member = fakeDb(tables())
    m.sessionUser.mockResolvedValue({ supabase: member.db, user: { id: 'u1' } })
    const { DELETE } = await import('../../app/api/member/orders/[batchId]/route')
    const res = await DELETE(new Request('https://x.test') as never, { params: Promise.resolve({ batchId: 'b1' }) })
    expect(res.status).toBe(200)
    expect(m.clean).toHaveBeenCalledWith(admin.db, {
      restaurantId: 'r1', businessDate: '2026-09-21', itemIds: ['oi1', 'oi2'], productIds: ['p1', 'p2'],
    })
    expect(member.writes.some(w => w.table === 'order_batches' && w.op === 'delete')).toBe(true)
  })

  it('회원 삭제: 처리 중인 발주(dispatched 등)는 400 이고 명세서를 건드리지 않는다', async () => {
    const member = fakeDb({ ...tables(), order_batches: [{ id: 'b1', restaurant_id: 'r1', business_date: '2099-01-01', status: 'dispatched' }] })
    m.sessionUser.mockResolvedValue({ supabase: member.db, user: { id: 'u1' } })
    const { DELETE } = await import('../../app/api/member/orders/[batchId]/route')
    const res = await DELETE(new Request('https://x.test') as never, { params: Promise.resolve({ batchId: 'b1' }) })
    expect(res.status).toBe(400)
    expect(m.clean).not.toHaveBeenCalled()
  })
})
