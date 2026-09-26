import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb, type FakeWrite } from '@/lib/testing/fake-db'

const state = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: async () => ({ user: { id: 'admin-1' }, db: state.db }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.db }))
vi.mock('@/lib/settlement-finance', () => ({ computeOutstanding: async () => 0, syncStatementFinance: async () => undefined }))

async function post(tables: Record<string, unknown[]>, line: { qty: number; unit_price: number }) {
  const f = fakeDb(tables)
  state.db = f.db
  const { POST } = await import('../../app/api/admin/settlement/update-spec-line/route')
  const res = await POST(new Request('https://example.test', {
    method: 'POST',
    body: JSON.stringify({ specId: 'spec-1', lines: [{ id: 'l1', ...line }] }),
  }) as never)
  return { res, orderWrites: f.writes.filter((w: FakeWrite) => w.table === 'order_items') }
}

const tables = (over: Record<string, unknown[]> = {}, lineOver: Record<string, unknown> = {}) => ({
  daily_specs: [{ id: 'spec-1', total_amount: 0, restaurant_id: 'r1', business_date: '2026-09-14' }],
  daily_spec_lines: [{ id: 'l1', product_id: 'p1', order_item_id: null, unit: 'ea', unit_price: 16000, amount: 80000, vat_amount: 0, ...lineOver }],
  products: [{ id: 'p1', taxable_flag: false, standard_name: '두절콩나물 8kg', pack_unit: null, kg_per_pack: null }],
  order_batches: [{ id: 'b1' }],
  orders: [{ id: 'o1' }],
  order_items: [{ id: 'oi1', qty: 4, unit: 'ea' }],
  sales_statement_lines: [],
  ...over,
})

describe('POST update-spec-line — 관리자가 고친 수량을 발주에도 적는다', () => {
  beforeEach(() => { vi.resetModules() })

  it('발주 연결이 있고 단위가 같으면 예전처럼 수량과 단가 기록을 옮긴다(회귀 없음)', async () => {
    const { res, orderWrites } = await post(tables({}, { order_item_id: 'oi1' }), { qty: 5, unit_price: 16000 })
    expect(res.status).toBe(200)
    expect(orderWrites).toEqual([{ table: 'order_items', op: 'update', payload: { qty: 5, unit_price_snapshot: 16000 } }])
  })

  it('★ 발주 연결이 끊긴 줄도 그날 그 식당 발주에 그 품목이 하나뿐이면 수량을 옮긴다', async () => {
    const { res, orderWrites } = await post(tables(), { qty: 5, unit_price: 16000 })
    expect(res.status).toBe(200)
    expect(orderWrites).toEqual([{ table: 'order_items', op: 'update', payload: { qty: 5, unit_price_snapshot: 16000 } }])
  })

  it('연결이 끊겼고 같은 품목 발주가 둘 이상이면 어느 것인지 몰라 옮기지 않는다', async () => {
    const { res, orderWrites } = await post(tables({ order_items: [{ id: 'a', qty: 1, unit: 'ea' }, { id: 'b', qty: 2, unit: 'ea' }] }), { qty: 5, unit_price: 16000 })
    expect(res.status).toBe(200)
    expect(orderWrites).toEqual([])
  })

  it('연결이 끊겼고 발주에 그 품목이 없으면(관리자가 손으로 넣은 품목) 발주를 만들거나 고치지 않는다', async () => {
    const { res, orderWrites } = await post(tables({ order_items: [] }), { qty: 5, unit_price: 16000 })
    expect(res.status).toBe(200)
    expect(orderWrites).toEqual([])
  })

  it('★ 발주는 kg, 명세서는 포장 단위(고추 10kg=1박스)면 kg 로 환산해 적고 단가 기록은 건드리지 않는다', async () => {
    const { res, orderWrites } = await post(
      tables({
        products: [{ id: 'p1', taxable_flag: false, standard_name: '청양고추', pack_unit: 'box', kg_per_pack: 10 }],
        order_items: [{ id: 'oi1', qty: 10, unit: 'kg' }],
      }, { order_item_id: 'oi1', unit: 'box', unit_price: 56000 }),
      { qty: 10, unit_price: 56000 },
    )
    expect(res.status).toBe(200)
    expect(orderWrites).toEqual([{ table: 'order_items', op: 'update', payload: { qty: 100 } }])
  })

  it('단위를 환산할 수 없으면 발주를 건드리지 않는다(엉뚱한 수량을 쓰지 않는다)', async () => {
    const { res, orderWrites } = await post(
      tables({ order_items: [{ id: 'oi1', qty: 3, unit: 'kg' }] }, { order_item_id: 'oi1', unit: 'box' }),
      { qty: 5, unit_price: 16000 },
    )
    expect(res.status).toBe(200)
    expect(orderWrites).toEqual([])
  })
})
