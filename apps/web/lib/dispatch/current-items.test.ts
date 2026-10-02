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
