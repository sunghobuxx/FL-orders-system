import { describe, expect, it } from 'vitest'
import { fakeDb } from '@/lib/testing/fake-db'
import { getCurrentDispatchGroups } from './current-items'

/**
 * 서울 식당(주소 기준)은 가락시장에서 직접 사다 납품한다 — 품목별 공급처 매칭을 거치지
 * 않고 garakItems 로 따로 빠져야 한다 (2026-10 가락시장 매입 시작).
 */
describe('getCurrentDispatchGroups — 서울 식당 분리', () => {
  it('서울 주소 식당의 품목은 garakItems 로, 그 외는 기존 공급처 매칭으로 간다', async () => {
    const f = fakeDb({
      order_batches: [
        { id: 'batch-seoul', business_date: '2026-10-05', restaurant_id: 'rest-seoul' },
        { id: 'batch-local', business_date: '2026-10-05', restaurant_id: 'rest-local' },
      ],
      restaurants: [
        { id: 'rest-seoul', organization_id: 'org-seoul' },
        { id: 'rest-local', organization_id: 'org-local' },
      ],
      orders: [
        { id: 'order-seoul', batch_id: 'batch-seoul' },
        { id: 'order-local', batch_id: 'batch-local' },
      ],
      organizations: [
        { id: 'org-seoul', name: '서울식당', address: '서울 송파구 가락동 123' },
        { id: 'org-local', name: '지방식당', address: '경기도 수원시 111' },
      ],
      order_items: [
        { id: 'item-seoul', product_id: 'prod-1', qty: 5, unit: 'kg', supplier_product_id: null, order_id: 'order-seoul', products: { standard_name: '양파' } },
        { id: 'item-local', product_id: 'prod-2', qty: 3, unit: 'kg', supplier_product_id: null, order_id: 'order-local', products: { standard_name: '대파' } },
      ],
      supplier_products: [
        { id: 'sp-1', product_id: 'prod-2', supplier_id: 'sup-1', updated_at: '2026-01-01' },
      ],
      suppliers: [{ id: 'sup-1', status: 'active' }],
    })

    const result = await getCurrentDispatchGroups(f.db, '2026-10-05')

    expect(result.garakItems.map(i => i.id)).toEqual(['item-seoul'])
    expect(result.grouped['sup-1']?.map(i => i.id)).toEqual(['item-local'])
    expect(result.unmappedItems).toEqual([])
  })

  it('주소가 없으면 서울로 보지 않는다', async () => {
    const f = fakeDb({
      order_batches: [{ id: 'batch-1', business_date: '2026-10-05', restaurant_id: 'rest-1' }],
      restaurants: [{ id: 'rest-1', organization_id: 'org-1' }],
      orders: [{ id: 'order-1', batch_id: 'batch-1' }],
      organizations: [{ id: 'org-1', name: '주소없음식당', address: null }],
      order_items: [
        { id: 'item-1', product_id: 'prod-1', qty: 1, unit: 'kg', supplier_product_id: null, order_id: 'order-1', products: { standard_name: '양파' } },
      ],
      supplier_products: [],
      suppliers: [],
    })

    const result = await getCurrentDispatchGroups(f.db, '2026-10-05')

    expect(result.garakItems).toEqual([])
    expect(result.unmappedItems.map(i => i.name)).toEqual(['양파'])
  })

  it('배치가 없으면 garakItems 도 빈 배열로 돌아온다', async () => {
    const f = fakeDb({ order_batches: [] })
    const result = await getCurrentDispatchGroups(f.db, '2026-10-05')
    expect(result.garakItems).toEqual([])
  })
})

describe('getCurrentDispatchGroups — 발주 문자 3분류', () => {
  function base(extra: Record<string, unknown> = {}) {
    return fakeDb({
      order_batches: [{ id: 'batch-seoul', business_date: '2026-10-05', restaurant_id: 'rest-seoul', status: 'submitted' }],
      restaurants: [{ id: 'rest-seoul', organization_id: 'org-seoul' }],
      orders: [{ id: 'order-seoul', batch_id: 'batch-seoul' }],
      organizations: [{ id: 'org-seoul', name: '서울식당', address: '서울 송파구' }],
      order_items: [
        { id: 'item-bean', product_id: 'prod-bean', qty: 4, unit: 'kg', supplier_product_id: null, order_id: 'order-seoul', check_stage: 0, products: { standard_name: '콩나물' } },
        { id: 'item-onion', product_id: 'prod-onion', qty: 2, unit: 'kg', supplier_product_id: null, order_id: 'order-seoul', check_stage: 0, products: { standard_name: '양파' } },
      ],
      supplier_products: [
        { id: 'sp-common', product_id: 'prod-bean', supplier_id: 'sup-common', updated_at: '2026-01-01' },
        { id: 'sp-garak', product_id: 'prod-onion', supplier_id: 'sup-garak', updated_at: '2026-01-02' },
      ],
      suppliers: [
        { id: 'sup-common', status: 'active', dispatch_group: 'common' },
        { id: 'sup-garak', status: 'active', dispatch_group: 'garak' },
      ],
      ...extra,
    })
  }

  it('가락 품목이 공통업체에 연결돼 있으면 공통업체 문자에도 들어간다 (가락 목록에도 남는다)', async () => {
    const f = base()
    const r = await getCurrentDispatchGroups(f.db, '2026-10-05')
    expect(r.garakItems.map(i => i.id)).toEqual(['item-bean', 'item-onion'])
    expect(r.grouped['sup-common']?.map(i => i.id)).toEqual(['item-bean'])
  })

  it('가락업체에 연결된 가락 품목은 가락업체 문자로 간다', async () => {
    const r = await getCurrentDispatchGroups(base().db, '2026-10-05')
    expect(r.grouped['sup-garak']?.map(i => i.id)).toEqual(['item-onion'])
  })

  it('가락업체는 일반 품목을 가로채지 않는다', async () => {
    const f = fakeDb({
      order_batches: [{ id: 'b1', business_date: '2026-10-05', restaurant_id: 'r1', status: 'submitted' }],
      restaurants: [{ id: 'r1', organization_id: 'o1' }],
      orders: [{ id: 'ord1', batch_id: 'b1' }],
      organizations: [{ id: 'o1', name: '지방식당', address: '경기 수원시' }],
      order_items: [
        { id: 'item-normal', product_id: 'prod-onion', qty: 3, unit: 'kg', supplier_product_id: null, order_id: 'ord1', check_stage: 0, products: { standard_name: '양파' } },
      ],
      supplier_products: [{ id: 'sp-garak', product_id: 'prod-onion', supplier_id: 'sup-garak', updated_at: '2026-01-02' }],
      suppliers: [{ id: 'sup-garak', status: 'active', dispatch_group: 'garak' }],
    })
    const r = await getCurrentDispatchGroups(f.db, '2026-10-05')
    expect(r.grouped['sup-garak']).toBeUndefined()
    expect(r.unmappedItems.map(i => i.name)).toEqual(['양파'])
  })
})
