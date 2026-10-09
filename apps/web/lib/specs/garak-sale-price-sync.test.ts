import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/settlement/generate', () => ({ generateStatements: vi.fn().mockResolvedValue(undefined) }))

import { syncSpecFromOrders } from './sync'
import { fakeDb } from '@/lib/testing/fake-db'

const P = 'p-kkaepsu'

function setup(opts: {
  allocated: boolean
  purchaseUnit?: string
  salePrice?: number | null
  address?: string | null
  orgPrice?: number
}) {
  const { db, writes } = fakeDb({
    order_items: [{ id: 'oi-garak', product_id: P, qty: 1, unit: 'box' }],
    products: [
      { id: P, standard_name: '깻잎', taxable_flag: false, pack_unit: null, kg_per_pack: null, is_fixed_price: false, default_unit: 'box', allowed_units: ['box'] },
    ],
    organizations: [{ id: 'org1', address: opts.address ?? null }],
    daily_specs: [{ id: 'spec-1' }],
    daily_spec_lines: [],
    garak_allocations: opts.allocated ? [{ id: 'a1', order_item_id: 'oi-garak', product_id: P }] : [],
    garak_purchases: [{ product_id: P, unit: opts.purchaseUnit ?? 'box', sale_price: opts.salePrice === undefined ? 25000 : opts.salePrice }],
    org_product_prices: opts.orgPrice !== undefined ? [{ organization_id: 'org1', product_id: P, unit_price: opts.orgPrice }] : [],
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

  it('가락 매입 단위가 발주 단위와 다르면 가락 공급가를 쓰지 않는다(0원)', async () => {
    const { db, writes } = setup({ allocated: true, purchaseUnit: 'kg' })
    await run(db)
    expect(savedLines(writes)[0].unit_price).toBe(0)
  })

  it('가락 공급가가 비어 있으면 가락 공급가를 쓰지 않는다(0원)', async () => {
    const { db, writes } = setup({ allocated: true, salePrice: null })
    await run(db)
    expect(savedLines(writes)[0].unit_price).toBe(0)
  })
})

describe('syncSpecFromOrders — 배정 없어도 비서울 식당은 기존 단가가 없으면 가락 단가를 쓴다 (2026-10-09)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('★ 비서울 식당 + 기존 단가 없음 + 가락 단가 있음 → 가락 단가(25,000)를 쓴다', async () => {
    const { db, writes } = setup({ allocated: false, address: '경기 부천시 원미구' })
    await run(db)
    expect(savedLines(writes)[0]).toMatchObject({ order_item_id: 'oi-garak', unit_price: 25000, price_overridden: false })
  })

  it('비서울 식당이라도 기존 단가가 있으면 가락 단가로 대체하지 않는다', async () => {
    const { db, writes } = setup({ allocated: false, address: '경기 부천시 원미구', orgPrice: 12000 })
    await run(db)
    expect(savedLines(writes)[0].unit_price).toBe(12000)
  })

  it('서울 식당은 배정 없이는 가락 단가로 자동 대체되지 않는다(0원) — 가락 살 것 목록으로 따로 간다', async () => {
    const { db, writes } = setup({ allocated: false, address: '서울 송파구 가락동' })
    await run(db)
    expect(savedLines(writes)[0].unit_price).toBe(0)
  })

  it('주소가 없으면 서울로 보지 않는다 — 기존 단가 없으면 가락 단가를 쓴다', async () => {
    const { db, writes } = setup({ allocated: false, address: null })
    await run(db)
    expect(savedLines(writes)[0].unit_price).toBe(25000)
  })
})
