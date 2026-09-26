import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/testing/fake-db'

const m = vi.hoisted(() => ({ clean: vi.fn(), db: null as unknown, session: vi.fn(), sessionUser: vi.fn(), driverDb: null as unknown, batchStatus: 'dispatched' }))
vi.mock('@/lib/specs/cleanup-deleted-batch', () => ({ cleanSpecAfterBatchDelete: m.clean }))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: m.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => m.db }))
vi.mock('@/lib/supabase/server', () => ({ getSessionUser: m.sessionUser }))
vi.mock('@/lib/driver-api', () => ({
  requireDriverUser: async () => ({ db: m.driverDb, user: { id: 'drv' }, role: 'manager', assignedRestaurantIds: null }),
  requireBatchAccess: async () => ({ batch: { id: 'b1', restaurant_id: 'r1', business_date: '2026-09-21', status: m.batchStatus } }),
}))

const FUTURE = '2099-01-01'
const tables = (date = '2026-09-21', status = 'submitted') => ({
  order_batches: [{ id: 'b1', restaurant_id: 'r1', business_date: date, status }],
  orders: [{ id: 'o1' }],
  order_items: [{ id: 'oi1', product_id: 'p1' }, { id: 'oi2', product_id: 'p2' }],
})
const ownerTables = { restaurants: [{ id: 'r1', organization_id: 'org1' }], memberships: [{ organization_id: 'org1' }] }
const ctxOf = () => ({ params: Promise.resolve({ batchId: 'b1' }) })
const del = (path: string) => import(path).then(mod => mod.DELETE)

describe('발주 삭제 — 명세서·정산서도 함께 정리한다', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks()
    m.clean.mockResolvedValue({ status: 'cleaned', removedLines: 2, removedSpec: true })
  })

  describe('어드민', () => {
    it('★ 발주를 지운 뒤에 그 식당·날짜·품목으로 명세서 정리를 부른다(삭제가 실패하면 정리하지 않기 위해)', async () => {
      const f = fakeDb(tables()); m.db = f.db
      m.session.mockResolvedValue({ user: { id: 'admin-1' } })
      let writesWhenCleaned: string[] = []
      m.clean.mockImplementation(async () => { writesWhenCleaned = f.writes.map(w => `${w.table}:${w.op}`) })
      const DELETE = await del('../../app/api/admin/orders/[batchId]/route')
      const res = await DELETE(new Request('https://x.test') as never, ctxOf())
      expect(res.status).toBe(200)
      expect(m.clean).toHaveBeenCalledWith(f.db, { restaurantId: 'r1', businessDate: '2026-09-21', itemIds: ['oi1', 'oi2'], productIds: ['p1', 'p2'] })
      expect(writesWhenCleaned).toContain('order_batches:delete')
      expect(writesWhenCleaned.indexOf('order_items:delete')).toBeLessThan(writesWhenCleaned.indexOf('order_batches:delete'))
    })

    it('★ 품목 삭제가 실패하면 500 이고 명세서·정산서는 건드리지 않는다(발주는 남아 있는데 청구만 빠지는 상태 방지)', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const f = fakeDb(tables(), { errors: { 'order_items:delete': { message: 'fk' } } }); m.db = f.db
      m.session.mockResolvedValue({ user: { id: 'admin-1' } })
      const DELETE = await del('../../app/api/admin/orders/[batchId]/route')
      const res = await DELETE(new Request('https://x.test') as never, ctxOf())
      expect(res.status).toBe(500)
      expect(m.clean).not.toHaveBeenCalled()
      spy.mockRestore()
    })

    it('명세서 정리가 실패해도 발주 삭제는 끝까지 간다(로그만 남긴다)', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      m.clean.mockRejectedValue(new Error('boom'))
      const f = fakeDb(tables()); m.db = f.db
      m.session.mockResolvedValue({ user: { id: 'admin-1' } })
      const DELETE = await del('../../app/api/admin/orders/[batchId]/route')
      const res = await DELETE(new Request('https://x.test') as never, ctxOf())
      expect(res.status).toBe(200)
      expect(f.writes.some(w => w.table === 'order_batches' && w.op === 'delete')).toBe(true)
      spy.mockRestore()
    })

    it('관리자가 아니면 403 이고 아무것도 정리하지 않는다', async () => {
      m.db = fakeDb(tables()).db
      m.session.mockResolvedValue(null)
      const DELETE = await del('../../app/api/admin/orders/[batchId]/route')
      expect((await DELETE(new Request('https://x.test') as never, ctxOf())).status).toBe(403)
      expect(m.clean).not.toHaveBeenCalled()
    })
  })

  describe('회원', () => {
    const memberDelete = async (memberTables: Record<string, unknown[]>, adminTables: Record<string, unknown[]>, errors: Record<string, { message: string }> = {}) => {
      const admin = fakeDb(adminTables); m.db = admin.db
      const member = fakeDb(memberTables, { errors })
      m.sessionUser.mockResolvedValue({ supabase: member.db, user: { id: 'u1' } })
      const DELETE = await del('../../app/api/member/orders/[batchId]/route')
      const res = await DELETE(new Request('https://x.test') as never, ctxOf())
      return { res, admin, member }
    }

    it('★ 본인 업체 발주: 발주를 지운 뒤 관리자 클라이언트로 명세서를 정리한다', async () => {
      const { res, admin, member } = await memberDelete(tables(FUTURE), ownerTables)
      expect(res.status).toBe(200)
      expect(m.clean).toHaveBeenCalledWith(admin.db, { restaurantId: 'r1', businessDate: FUTURE, itemIds: ['oi1', 'oi2'], productIds: ['p1', 'p2'] })
      expect(member.writes.some(w => w.table === 'order_batches' && w.op === 'delete')).toBe(true)
    })

    it('★ 남의 업체 발주는 403 — 관리자 권한으로 명세서를 고치기 전에 소유권을 확인한다', async () => {
      const { res, member } = await memberDelete(tables(FUTURE), { restaurants: [{ id: 'r1', organization_id: 'org1' }], memberships: [] })
      expect(res.status).toBe(403)
      expect(m.clean).not.toHaveBeenCalled()
      expect(member.writes).toEqual([])
    })

    it('★ 지난 날짜의 발주는 회원이 지울 수 없다(403) — 이미 청구된 기간의 금액이 빠지지 않게', async () => {
      const { res } = await memberDelete(tables('2000-01-01'), ownerTables)
      expect(res.status).toBe(403)
      expect(m.clean).not.toHaveBeenCalled()
    })

    it('★ 삭제가 실제로 안 됐으면(RLS 로 0행) 성공이라 하지 않고 명세서도 정리하지 않는다', async () => {
      const { res } = await memberDelete({ ...tables(FUTURE) }, ownerTables, { 'order_batches:delete': { message: 'denied' } })
      expect(res.status).toBe(500)
      expect(m.clean).not.toHaveBeenCalled()
    })

    it('처리 중인 발주(dispatched 등)는 400 이고 명세서를 건드리지 않는다', async () => {
      const { res } = await memberDelete(tables(FUTURE, 'dispatched'), ownerTables)
      expect(res.status).toBe(400)
      expect(m.clean).not.toHaveBeenCalled()
    })
  })

  describe('배송앱', () => {
    const driverDelete = async (status: string) => {
      m.batchStatus = status
      const f = fakeDb(tables('2026-09-21', status)); m.driverDb = f.db
      const DELETE = await del('../../app/api/driver/orders/[batchId]/route')
      const res = await DELETE(new Request('https://x.test') as never, ctxOf())
      return { res, f }
    }

    it('★ 배송이 끝난(completed) 발주는 삭제할 수 없다(409) — 납품한 물건값이 청구서에서 빠지지 않게', async () => {
      const { res, f } = await driverDelete('completed')
      expect(res.status).toBe(409)
      expect(f.writes).toEqual([])
      expect(m.clean).not.toHaveBeenCalled()
    })

    it('배송 전·배송 중(dispatched 등) 발주는 예전처럼 삭제되고 명세서도 정리된다', async () => {
      const { res, f } = await driverDelete('dispatched')
      expect(res.status).toBe(200)
      expect(f.writes.some(w => w.table === 'order_batches' && w.op === 'delete')).toBe(true)
      expect(m.clean).toHaveBeenCalledWith(f.db, { restaurantId: 'r1', businessDate: '2026-09-21', itemIds: ['oi1', 'oi2'], productIds: ['p1', 'p2'] })
    })
  })
})
