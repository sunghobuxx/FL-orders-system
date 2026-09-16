import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({ status: 'submitted', inserted: [] as unknown[], price: 24000, member: true }))
const pricing = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/server', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/orders/archive-items', () => ({ archiveOrderItems: vi.fn() }))
vi.mock('@/lib/dispatch/current-items', () => ({ refreshDispatchJobItems: vi.fn() }))
vi.mock('@/lib/specs/sync', () => ({ buildPriceMapByProduct: pricing, syncSpecFromOrders: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'member' } } }) },
  from: (table: string) => {
    const rows: Record<string, unknown> = {
      restaurants: { id: 'restaurant', organization_id: 'org' },
      memberships: state.member ? { organization_id: 'org' } : null,
      products: [{ id: 'onion', standard_name: '양파', default_unit: 'kg', allowed_units: ['kg', 'bag'], pack_unit: 'bag', kg_per_pack: 15 }],
      supplier_products: [{ id: 'supplier', product_id: 'onion' }],
      order_batches: { id: 'batch', status: state.status },
      orders: { id: 'order' },
      order_items: [],
    }
    const query: Record<string, any> = {}
    for (const method of ['select', 'eq', 'in', 'order', 'limit', 'maybeSingle', 'single', 'delete', 'update']) query[method] = () => query
    query.insert = (items: unknown[]) => { if (table === 'order_items') state.inserted = items; return query }
    query.then = (resolve: (value: unknown) => void) => resolve({ data: table in rows ? rows[table] : [], error: null })
    return query
  },
}) }))

import { POST } from '@/app/api/member/orders/route'

const submit = (qty = 15, unit = 'kg', businessDate = '2099-09-09') => POST(new NextRequest('http://localhost/api/member/orders', {
  method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
  body: JSON.stringify({ restaurantId: 'restaurant', businessDate, batchId: 'batch', isSubmit: true,
    items: [{ product_id: 'onion', qty, unit, unit_price_snapshot: 0 }] }),
}))

beforeEach(() => {
  state.status = 'submitted'; state.inserted = []; state.price = 24000; state.member = true
  pricing.mockReset().mockImplementation(async () => ({ priceMap: { onion: state.price }, orgOverrides: new Set() }))
})
afterEach(() => vi.useRealTimers())

describe('회원 발주 수정', () => {
  it('한국시간 오후 2시 이후 다음날 발주를 수정할 수 있다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-08T14:01:00+09:00'))
    expect((await submit(2, 'bag', '2026-09-09')).status).toBe(200)
    expect(state.inserted[0]).toMatchObject({ qty: 2, unit: 'bag' })
  })
  it('오후 2시에는 마감된 당일 발주를 덮어쓰지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-08T14:01:00+09:00'))
    expect((await submit(2, 'bag', '2026-09-08')).status).toBe(403)
    expect(state.inserted).toEqual([])
  })
  it('이미 제출한 발주를 수정하며 15kg를 1포와 포 단가로 저장한다', async () => {
    expect((await submit()).status).toBe(200)
    expect(state.inserted[0]).toMatchObject({ qty: 1, unit: 'bag', unit_price_snapshot: 24000 })
    expect(pricing.mock.calls[0][4]).toEqual({ onion: 'bag' })
  })
  it('앱에서 포 단위를 직접 선택한 수량을 그대로 저장한다', async () => {
    expect((await submit(2, 'bag')).status).toBe(200)
    expect(state.inserted[0]).toMatchObject({ qty: 2, unit: 'bag', unit_price_snapshot: 24000 })
  })
  it('3kg는 kg 단가로 저장한다', async () => {
    state.price = 3000
    expect((await submit(3)).status).toBe(200)
    expect(state.inserted[0]).toMatchObject({ qty: 3, unit: 'kg', unit_price_snapshot: 3000 })
    expect(pricing.mock.calls[0][4]).toEqual({ onion: 'kg' })
  })
  it.each(['validated', 'ordered', 'dispatched', 'completed'])('진행 상태 %s의 발주는 덮어쓰지 않는다', async status => {
    state.status = status
    expect((await submit()).status).toBe(409)
    expect(state.inserted).toEqual([])
  })
  it('다른 업체의 발주는 수정할 수 없다', async () => {
    state.member = false
    expect((await submit()).status).toBe(403)
    expect(state.inserted).toEqual([])
  })
  it('지난 배송일의 발주는 수정할 수 없다', async () => {
    expect((await submit(1, 'bag', '2020-01-01')).status).toBe(400)
    expect(state.inserted).toEqual([])
  })
})
