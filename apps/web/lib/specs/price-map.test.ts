import { describe, it, expect } from 'vitest'
import { buildPriceMapByProduct } from './sync'

/**
 * 단가 조회를 쓰는 곳이 여러 곳이다(명세서 생성·재계산·발주). 단위를 안 보면
 * 박스 단가가 개당 줄에 붙는다 — 2026-09-12 백오이 5개가 325,000원으로 나갈 뻔했다.
 * 그 규칙을 함수 단위로 못 박아 둔다.
 */

const 양파 = '11111111-1111-1111-1111-111111111111'
const 미나리 = '22222222-2222-2222-2222-222222222222'

/** supabase 쿼리 빌더 흉내 — 테이블별로 준비된 행을 그대로 돌려준다. */
function fakeDb(rows: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      for (const m of ['select', 'in', 'eq', 'lte', 'is', 'order']) builder[m] = chain
      // await 되는 지점: then 으로 결과를 준다
      builder.then = (resolve: (v: { data: unknown[] }) => void) =>
        resolve({ data: rows[table] ?? [] })
      return builder
    },
  }
}

const 기본행 = {
  supplier_products: [
    { id: 'sp-onion', product_id: 양파 },
    { id: 'sp-minari', product_id: 미나리 },
  ],
  products: [
    // 양파는 kg·bag 둘 다 쓴다 (다단위)
    { id: 양파, is_fixed_price: false, default_unit: 'kg', allowed_units: ['kg', 'bag'] },
    // 미나리는 box 하나뿐 (단일단위)
    { id: 미나리, is_fixed_price: false, default_unit: 'box', allowed_units: ['box'] },
  ],
  org_product_prices: [],
}

describe('buildPriceMapByProduct — 단위', () => {
  it('다단위 품목은 발주 단위의 단가만 쓴다 — 포 단가가 kg 줄에 붙으면 안 된다', async () => {
    const db = fakeDb({
      ...기본행,
      price_snapshots: [
        { supplier_product_id: 'sp-onion', sale_price: 24000, unit: 'bag' },
        { supplier_product_id: 'sp-onion', sale_price: 3000, unit: 'kg' },
      ],
    })
    const { priceMap } = await buildPriceMapByProduct(
      db, [양파], '2026-09-12', null, { [양파]: 'kg' })
    expect(priceMap[양파]).toBe(3000)
  })

  it('그 단위 단가가 없으면 다른 단위로 때우지 않는다 (0원으로 남긴다)', async () => {
    const db = fakeDb({
      ...기본행,
      price_snapshots: [
        { supplier_product_id: 'sp-onion', sale_price: 24000, unit: 'bag' },
      ],
    })
    const { priceMap } = await buildPriceMapByProduct(
      db, [양파], '2026-09-12', null, { [양파]: 'kg' })
    expect(priceMap[양파]).toBeUndefined()
  })

  it('단위가 하나뿐인 품목은 표기가 달라도 단가를 찾는다 (미나리 옛 단가 멈춤 사고 방지)', async () => {
    const db = fakeDb({
      ...기본행,
      price_snapshots: [
        { supplier_product_id: 'sp-minari', sale_price: 38000, unit: '박스' },
      ],
    })
    const { priceMap } = await buildPriceMapByProduct(
      db, [미나리], '2026-09-12', null, { [미나리]: 'box' })
    expect(priceMap[미나리]).toBe(38000)
  })

  it('발주 단위를 안 넘기면 단위를 가리지 않는다 (예전 동작)', async () => {
    const db = fakeDb({
      ...기본행,
      price_snapshots: [
        { supplier_product_id: 'sp-onion', sale_price: 24000, unit: 'bag' },
      ],
    })
    const { priceMap } = await buildPriceMapByProduct(db, [양파], '2026-09-12', null)
    expect(priceMap[양파]).toBe(24000)
  })
})
