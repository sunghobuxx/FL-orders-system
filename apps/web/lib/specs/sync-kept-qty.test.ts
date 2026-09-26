import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/settlement/generate', () => ({ generateStatements: vi.fn().mockResolvedValue(undefined) }))

import { syncSpecFromOrders } from './sync'

/**
 * 가짜 DB — from(테이블) 뒤에 무슨 메서드를 이어 붙이든 같은 빌더가 돌아오고, await 하면 그 테이블의 준비된 행이 나온다.
 * insert/update/delete 는 호출 내용을 기록한다. syncSpecFromOrders 가 어떤 줄을 저장하는지만 본다.
 */
function fakeDb(tables: Record<string, unknown[]>) {
  const writes: Array<{ table: string; op: string; payload: unknown }> = []
  const from = (table: string) => {
    let op = 'select'
    const builder: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve({ data: op === 'select' ? (tables[table] ?? []) : null, error: null }).then(resolve, reject)
        }
        if (prop === 'insert' || prop === 'update' || prop === 'delete') {
          return (payload?: unknown) => { op = prop; writes.push({ table, op: prop, payload }); return builder }
        }
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null })
        }
        return () => builder
      },
    })
    return builder
  }
  return { db: { from }, writes }
}

const P_FIXED = 'p-fixed'
const P_MANUAL = 'p-manual'

function setup(existingLines: unknown[], orderItems: unknown[]) {
  const { db, writes } = fakeDb({
    order_items: orderItems,
    products: [
      { id: P_FIXED, standard_name: '두절콩나물 8kg', taxable_flag: false, pack_unit: null, kg_per_pack: null, is_fixed_price: false, default_unit: 'ea', allowed_units: ['ea'] },
      { id: P_MANUAL, standard_name: '수동품목', taxable_flag: false, pack_unit: null, kg_per_pack: null, is_fixed_price: false, default_unit: 'ea', allowed_units: ['ea'] },
    ],
    daily_specs: [{ id: 'spec-1' }],
    daily_spec_lines: existingLines,
  })
  return { db, writes }
}

const savedLines = (writes: Array<{ table: string; op: string; payload: any }>) =>
  writes.find(w => w.table === 'daily_spec_lines' && w.op === 'insert')!.payload as any[]

describe('syncSpecFromOrders — 잠긴 줄의 수량은 최신 발주를 따른다', () => {
  beforeEach(() => vi.clearAllMocks())

  it('★ 잠긴(고정단가) 줄: 발주가 3→4 로 바뀌면 명세서 수량도 4, 단가는 그대로, 합계도 새로 계산 (중랑점 9/26)', async () => {
    const { db, writes } = setup(
      [{ id: 'l1', product_id: P_FIXED, qty: 3, unit: 'ea', unit_price: 16000, vat_amount: 0, price_overridden: true }],
      [{ id: 'oi-new', product_id: P_FIXED, qty: 4, unit: 'ea' }],
    )
    const id = await syncSpecFromOrders(db as never, { restaurantId: 'r1', businessDate: '2026-09-26', orderIds: ['o1'], organizationId: 'org1' })
    expect(id).toBe('spec-1')
    const lines = savedLines(writes)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ product_id: P_FIXED, qty: 4, unit: 'ea', unit_price: 16000, vat_amount: 0, price_overridden: true, order_item_id: 'oi-new', daily_spec_id: 'spec-1' })
    const specUpdate = writes.find(w => w.table === 'daily_specs' && w.op === 'update')!.payload as any
    expect(specUpdate.total_amount).toBe(64000)
  })

  it('관리자가 발주에 없는 품목을 손으로 넣은 줄은 그대로 남는다(수량·단가 유지)', async () => {
    const { db, writes } = setup(
      [
        { id: 'l1', product_id: P_FIXED, qty: 3, unit: 'ea', unit_price: 16000, vat_amount: 0, price_overridden: true },
        { id: 'l2', product_id: P_MANUAL, qty: 2, unit: 'ea', unit_price: 5000, vat_amount: 0, price_overridden: true },
      ],
      [{ id: 'oi-new', product_id: P_FIXED, qty: 3, unit: 'ea' }],
    )
    await syncSpecFromOrders(db as never, { restaurantId: 'r1', businessDate: '2026-09-26', orderIds: ['o1'], organizationId: 'org1' })
    const lines = savedLines(writes)
    expect(lines.find(l => l.product_id === P_MANUAL)).toMatchObject({ qty: 2, unit_price: 5000, price_overridden: true })
    expect(lines.find(l => l.product_id === P_FIXED)).toMatchObject({ qty: 3, unit_price: 16000 })
  })

  it('단위가 다르게 발주되면 잠긴 줄을 그대로 둔다(단가가 단위별이라)', async () => {
    const { db, writes } = setup(
      [{ id: 'l1', product_id: P_FIXED, qty: 2, unit: 'box', unit_price: 7000, vat_amount: 0, price_overridden: true }],
      [{ id: 'oi-new', product_id: P_FIXED, qty: 5, unit: 'ea' }],
    )
    await syncSpecFromOrders(db as never, { restaurantId: 'r1', businessDate: '2026-09-26', orderIds: ['o1'], organizationId: 'org1' })
    expect(savedLines(writes)[0]).toMatchObject({ qty: 2, unit: 'box', unit_price: 7000 })
  })

  it('잠기지 않은 줄은 예전처럼 발주 수량을 따르고 등록 단가를 쓴다(회귀 없음)', async () => {
    const { db, writes } = setup(
      [{ id: 'l1', product_id: P_FIXED, qty: 3, unit: 'ea', unit_price: 15000, vat_amount: 0, price_overridden: false }],
      [{ id: 'oi-new', product_id: P_FIXED, qty: 4, unit: 'ea' }],
    )
    await syncSpecFromOrders(db as never, { restaurantId: 'r1', businessDate: '2026-09-26', orderIds: ['o1'], organizationId: 'org1' })
    expect(savedLines(writes)[0]).toMatchObject({ qty: 4, price_overridden: false })
  })
})
