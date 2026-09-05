/* eslint-disable @typescript-eslint/no-explicit-any */

import { fetchAll } from '@/lib/supabase/fetch-all'
import { normalizeUnit } from '@/lib/units'

/**
 * 매입원가 조회.
 *
 * order_items.unit_price_snapshot 에는 **판매가**(price_snapshots.sale_price)가 들어간다.
 * 단가 등록 라우트가 sale_price 를 그대로 넣기 때문이다.
 * 그런데 총매입·매입 정산이 그 값을 그대로 더하고 있어서, 공급처에 준 적 없는 마진까지
 * 매입으로 잡혔다. 2026-07 기준 총매입이 총매출과 거의 같아져 순이익이 음수로 나왔다.
 *
 * 매입원가는 price_snapshots.purchase_price 다. 단가와 같은 규칙으로 그 날짜에
 * 유효한 값(effective_from <= 영업일 중 가장 최근)을 쓴다.
 *
 * **단위까지 맞춰야 한다.** 판매단가는 단위별로 찾는데 매입가만 안 그러면,
 * kg 로 판 양파에 bag 매입가(15,000)가 붙어 원가가 판매가의 7 배가 된다.
 * 2026-09 에 양파·무·당근이 그렇게 잡혀 순이익률이 14% → 3% 로 주저앉았다.
 */
export interface PurchaseCostResolver {
  /**
   * 그 영업일·그 단위의 매입원가. 등록된 값이 없으면 null.
   *
   * unit 을 주면 그 단위 것만 쓴다. 다른 단위 값으로 대신하지 않는다 —
   * 단위가 다르면 아예 다른 금액이라 원가가 통째로 틀어진다.
   */
  costOf(productId: string, businessDate: string, unit?: string | null): number | null
}

export async function buildPurchaseCostResolver(
  db: any,
  productIds: string[],
): Promise<PurchaseCostResolver> {
  if (!productIds.length) return { costOf: () => null }

  const spRows = await fetchAll<{ id: string; product_id: string }>(() => db
    .from('supplier_products')
    .select('id, product_id')
    .in('product_id', productIds)
    .eq('status', 'active'))

  const spToProduct = new Map(spRows.map(r => [r.id, r.product_id]))
  const spIds = spRows.map(r => r.id)
  if (!spIds.length) return { costOf: () => null }

  const snaps = await fetchAll<{
    supplier_product_id: string; purchase_price: number | null; effective_from: string; unit: string | null
  }>(() => db
    .from('price_snapshots')
    .select('supplier_product_id, purchase_price, effective_from, unit')
    .in('supplier_product_id', spIds)
    .order('effective_from', { ascending: false }))

  // `품목` 과 `품목:단위` 두 벌로 담는다. 단위를 아는 쪽을 먼저 보고,
  // 단위 없이 물으면(옛 호출부) 예전처럼 품목 최신값을 준다.
  const byProduct = new Map<string, { from: string; cost: number }[]>()
  const byProductUnit = new Map<string, { from: string; cost: number }[]>()
  const push = (map: Map<string, { from: string; cost: number }[]>, key: string, row: { from: string; cost: number }) => {
    const arr = map.get(key)
    if (arr) arr.push(row)
    else map.set(key, [row])
  }
  for (const s of snaps) {
    const pid = spToProduct.get(s.supplier_product_id)
    const cost = Number(s.purchase_price ?? 0)
    if (!pid || !(cost > 0)) continue
    const row = { from: s.effective_from, cost }
    push(byProduct, pid, row)
    if (s.unit) push(byProductUnit, `${pid}:${normalizeUnit(s.unit)}`, row)
  }

  const pick = (arr: { from: string; cost: number }[] | undefined, businessDate: string) => {
    if (!arr?.length) return null
    for (const row of arr) if (row.from <= businessDate) return row.cost
    return null
  }

  return {
    costOf(productId: string, businessDate: string, unit?: string | null) {
      // 단위를 알면 그 단위 것만 쓴다. 없으면 없는 대로 둔다 —
      // 다른 단위 매입가로 때우면 원가가 몇 배로 튄다.
      if (unit) return pick(byProductUnit.get(`${productId}:${normalizeUnit(unit)}`), businessDate)
      return pick(byProduct.get(productId), businessDate)
    },
  }
}
