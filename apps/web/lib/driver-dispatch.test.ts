import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ groups: vi.fn(), saved: vi.fn(), auth: vi.fn(), access: vi.fn(), apply: vi.fn() }))
vi.mock('./dispatch/current-items', async importOriginal => ({ ...await importOriginal<typeof import('./dispatch/current-items')>(), getCurrentDispatchGroups: mocks.groups, getDispatchJobItemRows: mocks.saved }))
vi.mock('./driver-api', () => ({ requireDriverUser: mocks.auth, requireBatchAccess: mocks.access }))
vi.mock('./orders/check-stage', () => ({ applyCheckStage: mocks.apply }))
import { loadDriverDispatch } from './driver-dispatch'
import { defaultDispatchDate } from '../../driver-mobile/lib/dispatch'
import { POST } from '../app/api/driver/orders/check-items/route'

function dbFor(tables: Record<string, any[]>) {
  return { from(table: string) {
    const filters: Array<(row: any) => boolean> = []
    const q: any = {
      select: () => q,
      eq: (key: string, value: unknown) => { filters.push(r => r[key] === value); return q },
      in: (key: string, values: unknown[]) => { filters.push(r => values.includes(r[key])); return q },
      then: (resolve: any, reject: any) => Promise.resolve({ data: (tables[table] ?? []).filter(r => filters.every(f => f(r))), error: null }).then(resolve, reject),
    }
    return q
  } } as any
}
const item = (id: string, qty: number, unit = 'kg') => ({ id, product_id: 'onion', qty, unit, supplier_product_id: null, products: { standard_name: '양파' }, restaurant_name: id, check_stage: 1, batch_status: 'ordered' })
let tables: Record<string, any[]>
beforeEach(() => {
  vi.clearAllMocks()
  mocks.groups.mockResolvedValue({ allItems: [item('regular', 2)], garakItems: [item('garak', 3), item('bag', 1, 'bag')], grouped: { supplier: [item('regular', 2)] }, inactiveGrouped: {}, unmappedItems: [] })
  mocks.saved.mockResolvedValue([])
  tables = {
    suppliers: [{ id: 'supplier', organizations: { name: '기존상회' } }],
    order_items: ['regular', 'garak', 'bag'].map((id, i) => ({ id, unit_price_snapshot: 100, orders: { batch_id: `batch-${id}`, order_batches: { restaurant_id: i ? 'other' : 'mine', status: 'ordered' } } })),
  }
})

describe('배송앱 발주 날짜와 세 구분', () => {
  it.each([
    ['2026-10-05T08:59:59Z', '2026-10-05'],
    ['2026-10-05T09:00:00Z', '2026-10-06'],
    ['2026-12-31T14:59:59Z', '2027-01-01'],
    ['2026-12-31T15:00:00Z', '2027-01-01'],
  ])('18시·연도 경계 %s', (now, date) => expect(defaultDispatchDate(new Date(now))).toBe(date))
  it('전체는 가락+기존을 합치고 kg/bag은 섞지 않는다', async () => {
    const result = await loadDriverDispatch(dbFor(tables), '2026-09-01', ['mine'])
    expect(result.totals.map(i => [i.unit, i.qty])).toEqual([['kg', 5], ['bag', 1]])
    expect(result.totalAmount).toBe(600)
    expect(result.garakItems).toHaveLength(2)
    expect(result.garakItems[0]).toMatchObject({ batchId: 'batch-garak', checkStage: 1, batchStatus: 'ordered', canManage: false })
    expect(result.suppliers[0].lines[0].rows[0]).toMatchObject({ batchId: 'batch-regular', canManage: true, unitPrice: 100 })
    expect(mocks.groups).toHaveBeenCalledWith(expect.anything(), '2026-09-01')
  })
  it('가락만 있는 날에도 집계가 표시된다', async () => {
    mocks.groups.mockResolvedValue({ allItems: [], garakItems: [item('garak', 3)], grouped: {}, inactiveGrouped: {}, unmappedItems: [] })
    const result = await loadDriverDispatch(dbFor(tables), '2026-10-05', null)
    expect(result.totalAmount).toBe(300)
    expect(result.suppliers).toEqual([])
    expect(result.garakItems[0].canManage).toBe(true)
  })
  it('문자용 수동 수량·제외는 보존하고 전체 집계는 원래 주문 수량이다', async () => {
    tables.dispatch_jobs = [{ id: 'job', supplier_id: 'supplier', status: 'sent', business_date: '2026-10-05' }]
    mocks.saved.mockResolvedValue([{ id: 'saved', orderItemId: 'regular', productId: 'onion', productName: '양파', restaurantName: '식당', qty: 9, orderQty: 2, unit: 'kg', checkStage: 1, overridden: true, excluded: true }])
    const result = await loadDriverDispatch(dbFor(tables), '2026-10-05', null)
    expect(result.suppliers[0].sent).toBe(true)
    expect(result.suppliers[0].lines[0]).toMatchObject({ qty: 0, rows: [{ qty: 0, excluded: true }] })
    expect(result.totals[0].qty).toBe(5)
    mocks.saved.mockResolvedValue([{ id: 'saved', orderItemId: 'regular', productId: 'onion', productName: '양파', restaurantName: '식당', qty: 9, orderQty: 2, unit: 'kg', checkStage: 1, overridden: true, excluded: false }])
    expect((await loadDriverDispatch(dbFor(tables), '2026-10-05', null)).suppliers[0].lines[0].qty).toBe(9)
  })
  it('빈 job과 비활성 공급처도 현재 주문을 표시한다', async () => {
    mocks.groups.mockResolvedValue({ allItems: [item('regular', 2)], garakItems: [], grouped: {}, inactiveGrouped: { supplier: [item('regular', 2)] }, unmappedItems: [] })
    tables.dispatch_jobs = [{ id: 'empty', supplier_id: 'supplier', business_date: '2026-10-05', status: 'pending' }]
    const result = await loadDriverDispatch(dbFor(tables), '2026-10-05', ['mine'])
    expect(result.suppliers[0]).toMatchObject({ autoDispatchExcluded: true, lines: [{ qty: 2 }] })
  })
})

describe('배송 확인 저장 전 품목 소속 검사', () => {
  const request = (ids: string[]) => new Request('https://example.test', { method: 'POST', body: JSON.stringify({ batchId: 'mine', itemIds: ids, stage: 1 }) })
  beforeEach(() => {
    mocks.auth.mockResolvedValue({ db: dbFor({ orders: [{ id: 'order', batch_id: 'mine' }], order_items: [{ id: 'allowed', order_id: 'order' }, { id: 'foreign', order_id: 'elsewhere' }] }) })
    mocks.access.mockResolvedValue({ batch: { id: 'mine' } })
    mocks.apply.mockResolvedValue({ batchId: 'mine', batchStatus: 'ordered', requiredStage: 2 })
  })
  it('다른 발주 품목이 하나라도 섞이면 저장 호출 전에 차단한다', async () => {
    expect((await POST(request(['allowed', 'foreign'])))?.status).toBe(403)
    expect(mocks.apply).not.toHaveBeenCalled()
  })
  it('담당 발주 품목은 기존 공용 확인 규칙을 사용한다', async () => {
    expect((await POST(request(['allowed'])))?.status).toBe(200)
    expect(mocks.apply).toHaveBeenCalledWith(expect.anything(), ['allowed'], 1, 'mine')
  })
})
