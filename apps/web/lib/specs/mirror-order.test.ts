import { describe, expect, it } from 'vitest'
import { fakeDb } from '@/lib/testing/fake-db'
import { findOrderItemForLine, orderQtyForSpecLine } from './mirror-order'

const box10kg = { pack_unit: 'box', kg_per_pack: 10 }

describe('orderQtyForSpecLine — 명세서에서 고친 수량을 발주에 옮길 값', () => {
  it('같은 단위면 수량 그대로, 단가 기록도 함께 옮긴다', () => {
    expect(orderQtyForSpecLine(5, 'ea', { id: 'i', qty: 4, unit: 'ea' }, null)).toEqual({ qty: 5, mirrorPrice: true })
  })

  it('표기만 다른 같은 단위(박스/box)도 같은 단위로 본다', () => {
    expect(orderQtyForSpecLine(2, 'box', { id: 'i', qty: 1, unit: '박스' }, null)).toEqual({ qty: 2, mirrorPrice: true })
  })

  it('★ 발주는 kg, 명세서는 포장 단위(고추 10kg=1박스)면 kg 로 환산해 옮기고 단가 기록은 건드리지 않는다', () => {
    expect(orderQtyForSpecLine(10, 'box', { id: 'i', qty: 10, unit: 'kg' }, box10kg)).toEqual({ qty: 100, mirrorPrice: false })
  })

  it('환산할 수 없는 단위 조합이면 옮기지 않는다(null) — 엉뚱한 수량을 쓰지 않는다', () => {
    expect(orderQtyForSpecLine(3, 'box', { id: 'i', qty: 3, unit: 'ea' }, null)).toBeNull()
    expect(orderQtyForSpecLine(3, 'bag', { id: 'i', qty: 45, unit: 'kg' }, box10kg)).toBeNull()
  })

  it('수량이 0 이하이거나 숫자가 아니면 옮기지 않는다', () => {
    for (const q of [0, -1, Number.NaN]) expect(orderQtyForSpecLine(q, 'ea', { id: 'i', qty: 1, unit: 'ea' }, null)).toBeNull()
  })

  it('명세서 줄에 단위가 없으면 같은 단위로 보고 옮긴다(예전 동작)', () => {
    expect(orderQtyForSpecLine(5, null, { id: 'i', qty: 4, unit: 'ea' }, null)).toEqual({ qty: 5, mirrorPrice: true })
  })
})

describe('findOrderItemForLine — 발주 연결이 끊긴 줄의 발주 품목 찾기', () => {
  const find = (tables: Record<string, unknown[]>) =>
    findOrderItemForLine(fakeDb(tables).db as never, { restaurantId: 'r1', businessDate: '2026-09-14', productId: 'p1' })

  it('그날 그 식당 발주에 그 품목이 딱 하나 있으면 돌려준다', async () => {
    expect(await find({ order_batches: [{ id: 'b1' }], orders: [{ id: 'o1' }], order_items: [{ id: 'oi1', qty: 4, unit: 'ea' }] }))
      .toEqual({ id: 'oi1', qty: 4, unit: 'ea' })
  })

  it('둘 이상이면 어느 것인지 모르므로 null', async () => {
    expect(await find({ order_batches: [{ id: 'b1' }], orders: [{ id: 'o1' }], order_items: [{ id: 'a', qty: 1, unit: 'ea' }, { id: 'b', qty: 2, unit: 'ea' }] })).toBeNull()
  })

  it('없으면 null(관리자가 손으로 넣은 품목)', async () => {
    expect(await find({ order_batches: [{ id: 'b1' }], orders: [{ id: 'o1' }], order_items: [] })).toBeNull()
    expect(await find({ order_batches: [], orders: [], order_items: [] })).toBeNull()
    expect(await find({ order_batches: [{ id: 'b1' }], orders: [], order_items: [] })).toBeNull()
  })
})
