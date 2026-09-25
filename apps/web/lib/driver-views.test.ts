import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.db }))
const loader = vi.hoisted(() => ({ map: new Map<string, unknown>(), fail: false }))
vi.mock('@/lib/pricing/price-status-loader', () => ({
  loadSpecStatuses: async () => { if (loader.fail) throw new Error('boom'); return loader.map },
}))
import { GET as dashboardHandler } from '@/app/api/driver/dashboard/route'
import { GET as orderDetailHandler, PATCH as patchHandler, DELETE as deleteHandler } from '@/app/api/driver/orders/[batchId]/route'
import { GET as ordersHandler } from '@/app/api/driver/orders/route'
import { GET as specsHandler } from '@/app/api/driver/specs/route'
import { getKstToday, addDays } from '@/lib/driver-api'

function checked<T extends unknown[]>(handler: (...args: T) => Promise<Response | undefined>) {
  return async (...args: T) => {
    const response = await handler(...args)
    if (!response) throw new Error('API returned no response')
    return response
  }
}
const dashboard = checked(dashboardHandler)
const orderDetail = checked(orderDetailHandler)
const PATCH = checked(patchHandler)
const DELETE = checked(deleteHandler)
const orders = checked(ordersHandler)
const specs = checked(specsHandler)

let tables: Record<string, any[]>
let writes: string[]
const today = getKstToday()
const tomorrow = addDays(today, 1)
const oldDate = '2025-02-28'
const restaurant = (name: string) => ({ organizations: { name } })

function query(table: string) {
  const predicates: Array<(row: any) => boolean> = []
  let one = false
  let limit = Infinity
  const q: any = {
    select: () => q,
    eq: (key: string, value: any) => { predicates.push(r => r[key] === value); return q },
    neq: (key: string, value: any) => { predicates.push(r => r[key] !== value); return q },
    in: (key: string, values: any[]) => { predicates.push(r => values.includes(r[key])); return q },
    gte: (key: string, value: any) => { predicates.push(r => r[key] >= value); return q },
    lte: (key: string, value: any) => { predicates.push(r => r[key] <= value); return q },
    ilike: () => q,
    order: () => q,
    limit: (value: number) => { limit = value; return q },
    single: () => { one = true; return q },
    maybeSingle: () => { one = true; return q },
    update: () => { writes.push(table); return q },
    delete: () => { writes.push(table); return q },
    then: (resolve: any, reject: any) => {
      const rows = (tables[table] ?? []).filter(r => predicates.every(p => p(r))).slice(0, limit)
      return Promise.resolve({ data: one ? rows[0] ?? null : rows, error: null }).then(resolve, reject)
    },
  }
  return q
}
function request(path: string, method = 'GET', body?: object) {
  return new Request(`https://example.test/api/driver/${path}`, {
    method, headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}
const params = (batchId: string) => ({ params: Promise.resolve({ batchId }) })

beforeEach(() => {
  loader.map = new Map(); loader.fail = false
  writes = []
  tables = {
    memberships: [{ user_id: 'manager-a', role: 'manager', organizations: { organization_type: 'operator' } }],
    manager_restaurants: [
      { user_id: 'manager-a', restaurant_id: 'a', users: { name: '김담당' } },
      { user_id: 'manager-b', restaurant_id: 'b', users: [{ name: '이담당' }] },
      { user_id: 'manager-c', restaurant_id: 'b', users: { name: '박담당' } },
    ],
    order_batches: [
      { id: 'batch-a', restaurant_id: 'a', status: 'dispatched', business_date: today, restaurants: restaurant('A식당'), orders: [] },
      { id: 'batch-b', restaurant_id: 'b', status: 'ordered', business_date: today, restaurants: restaurant('B식당'), orders: [] },
      { id: 'batch-old', restaurant_id: 'a', status: 'completed', business_date: oldDate, restaurants: restaurant('A식당'), orders: [] },
      { id: 'batch-unassigned', restaurant_id: 'c', status: 'submitted', business_date: tomorrow, restaurants: restaurant('C식당'), orders: [] },
    ],
    dispatch_jobs: [today, tomorrow].map(business_date => ({ id: business_date, business_date, dispatch_job_items: [] })),
    daily_specs: [
      { id: 'spec-today', restaurant_id: 'a', business_date: today, total_amount: 100, restaurants: restaurant('A식당'), daily_spec_lines: [] },
      { id: 'spec-old', restaurant_id: 'a', business_date: oldDate, total_amount: 250, restaurants: restaurant('A식당'), daily_spec_lines: [{ id: 'line', qty: 2, unit: 'kg', unit_price: 125, amount: 250, products: { standard_name: '사과' } }] },
      { id: 'spec-other', restaurant_id: 'b', business_date: oldDate, total_amount: 900, restaurants: restaurant('B식당'), daily_spec_lines: [] },
    ],
  }
  state.db = { from: query, auth: { getUser: async () => ({ data: { user: { id: 'manager-a' } }, error: null }) } }
})

describe('배송앱 조회와 처리 권한', () => {
  it('기본 대시보드는 담당 업체의 실제 배송 상태를 반환한다', async () => {
    const body = await (await dashboard(request('dashboard'))).json()
    expect(body.orders.map((r: any) => r.id)).toEqual(['batch-a'])
    expect(body.orders[0].status).toBe('dispatched')
    expect(body.orders[0].managerNames).toEqual(['김담당'])
  })
  it('전체 조회는 다른 담당자와 미지정 업체를 포함하고 복수 담당자를 표시한다', async () => {
    const body = await (await dashboard(request('dashboard?scope=all'))).json()
    expect(body.orders.map((r: any) => r.id)).toEqual(['batch-a', 'batch-b', 'batch-unassigned'])
    expect(body.orders.find((r: any) => r.id === 'batch-b').managerNames).toEqual(['박담당', '이담당'])
    expect(body.orders.find((r: any) => r.id === 'batch-unassigned').managerNames).toEqual([])
    expect(body.totalAssignedOrders).toBe(1)
    expect(writes).toEqual([])
  })
  it('다른 담당자 상세는 읽을 수 있고 수정 가능 여부는 false다', async () => {
    const response = await orderDetail(request('orders/batch-b'), params('batch-b'))
    expect(response.status).toBe(200)
    expect((await response.json()).canManage).toBe(false)
    expect(writes).toEqual([])
  })
  it('자기 담당 업체 상세는 수정 가능하다', async () => {
    const body = await (await orderDetail(request('orders/batch-a'), params('batch-a'))).json()
    expect(body.canManage).toBe(true)
  })
  it('전체를 조회했어도 다른 업체 날짜 변경과 삭제는 서버에서 차단한다', async () => {
    await dashboard(request('dashboard?scope=all'))
    expect((await PATCH(request('orders/batch-b', 'PATCH', { businessDate: oldDate }), params('batch-b'))).status).toBe(403)
    expect((await DELETE(request('orders/batch-b', 'DELETE'), params('batch-b'))).status).toBe(403)
    expect(writes).toEqual([])
  })
  it('식당 owner 계정은 전체 조회와 상세에 접근할 수 없다', async () => {
    tables.memberships[0] = { user_id: 'manager-a', role: 'owner', organizations: { organization_type: 'restaurant' } }
    expect((await dashboard(request('dashboard?scope=all'))).status).toBe(403)
    expect((await orderDetail(request('orders/batch-b'), params('batch-b'))).status).toBe(403)
  })
  it('로그인 없이는 전체 조회를 할 수 없다', async () => {
    expect((await dashboard(new Request('https://example.test/api/driver/dashboard?scope=all'))).status).toBe(401)
  })
  it('30일보다 오래된 날짜도 그 날짜 주문과 인쇄용 명세서 전체를 조회한다', async () => {
    const orderBody = await (await orders(request(`orders?mode=today&date=${oldDate}`))).json()
    expect(orderBody.orders.map((r: any) => r.id)).toEqual(['batch-old'])
    const specBody = await (await specs(request(`specs?mode=today&date=${oldDate}`))).json()
    expect(specBody.specs.map((r: any) => r.id)).toEqual(['spec-old'])
    expect(specBody.specs[0]).toMatchObject({ businessDate: oldDate, totalAmount: 250, lines: [{ productName: '사과', qty: 2, unitPrice: 125, amount: 250 }] })
    expect(writes).toEqual([])
  })
  it('배송앱 명세서에 단가 확정 상태를 붙인다 — 오래된 미확정 날짜도 표시한다', async () => {
    loader.map = new Map([['spec-old', { status: 'pending', at: null }]])
    const body = await (await specs(request(`specs?mode=today&date=${oldDate}`))).json()
    expect(body.specs[0].priceStatus).toEqual({ status: 'pending', at: null })
  })
  it('정산 확정된 명세서는 final, 시행일 이전(none)은 필드가 없다', async () => {
    loader.map = new Map([['spec-old', { status: 'final', at: null }]])
    expect((await (await specs(request(`specs?mode=today&date=${oldDate}`))).json()).specs[0].priceStatus)
      .toEqual({ status: 'final', at: null })
    loader.map = new Map()
    expect((await (await specs(request(`specs?mode=today&date=${oldDate}`))).json()).specs[0]).not.toHaveProperty('priceStatus')
  })
  it('상태 조회가 실패해도 명세서 목록은 그대로 200 이다', async () => {
    loader.fail = true
    const response = await specs(request(`specs?mode=today&date=${oldDate}`))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.specs.map((r: any) => r.id)).toEqual(['spec-old'])
    expect(body.specs[0]).not.toHaveProperty('priceStatus')
  })
  it('조회 날짜에 자료가 없으면 오늘 자료를 섞지 않는다', async () => {
    const body = await (await specs(request('specs?mode=today&date=2024-01-01'))).json()
    expect(body.specs).toEqual([])
  })
})
