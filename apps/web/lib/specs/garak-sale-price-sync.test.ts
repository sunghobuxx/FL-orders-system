import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/settlement/generate', () => ({ generateStatements: vi.fn().mockResolvedValue(undefined) }))

import { syncSpecFromOrders } from './sync'
import { fakeDb } from '@/lib/testing/fake-db'

const P = 'p-kkaepsu'

function setup(opts: { allocated: boolean; purchaseUnit?: string; salePrice?: number | null }) {
  const { db, writes } = fakeDb({
    order_items: [{ id: 'oi-garak', product_id: P, qty: 1, unit: 'box' }],
    products: [
      { id: P, standard_name: '깻잎', taxable_flag: false, pack_unit: null, kg_per_pack: null, is_fixed_price: false, default_unit: 'box', allowed_units: ['box'] },
    ],
    daily_specs: [{ id: 'spec-1' }],
    daily_spec_lines: [],
    garak_allocations: opts.allocated ? [{ id: 'a1', order_item_id: 'oi-garak', product_id: P }] : [],
    garak_purchases: [{ product_id: P, unit: opts.purchaseUnit ?? 'box', sale_price: opts.salePrice === undefined ? 25000 : opts.salePrice }],
  })
  return { db, writes }
}

const savedLines = (writes: Array<{ table: string; op: string; payload: any }>) =>
  writes.find(w => w.table === 'daily_spec_lines' && w.op === 'insert')!.payload as any[]

const run = (db: unknown) =>
  syncSpecFromOrders(db as never, { restaurantId: 'r1', businessDate: '2026-10-03', orderIds: ['o1'], organizationId: 'org1' })

describe('syncSpecFromOrders — 가락 배정 줄은 가락 공급가를 쓴다', () => {
  beforeEach(() => vi.clearAllMocks())

  it('★ 배정된 줄은 가락 공급가(25,000)로 저장되고 명세서 합계도 그 값이다', async () => {
    const { db, writes } = setup({ allocated: true })
    await run(db)
    expect(savedLines(writes)[0]).toMatchObject({ order_item_id: 'oi-garak', unit_price: 25000, price_overridden: false })
    expect(writes.find(w => w.table === 'daily_specs' && w.op === 'update')!.payload).toMatchObject({ total_amount: 25000 })
  })

  it('배정이 없으면 가락 공급가를 쓰지 않는다 (기존 단가 경로)', async () => {
    const { db, writes } = setup({ allocated: false })
    await run(db)
    expect(savedLines(writes)[0].unit_price).toBe(0)
  })

  it('가락 매입 단위가 발주 단위와 다르면 가락 공급가를 쓰지 않는다', async () => {
    const { db, writes } = setup({ allocated: true, purchaseUnit: 'kg' })
    await run(db)
    expect(savedLines(writes)[0].unit_price).toBe(0)
  })

  it('가락 공급가가 비어 있으면 가락 공급가를 쓰지 않는다', async () => {
    const { db, writes } = setup({ allocated: true, salePrice: null })
    await run(db)
    expect(savedLines(writes)[0].unit_price).toBe(0)
  })
})
