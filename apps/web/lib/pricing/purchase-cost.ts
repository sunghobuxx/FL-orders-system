/* eslint-disable @typescript-eslint/no-explicit-any */

import { fetchAll } from '@/lib/supabase/fetch-all'

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
 */
export interface PurchaseCostResolver {
  /** 그 영업일의 매입원가. 등록된 값이 없으면 null */
  costOf(productId: string, businessDate: string): number | null
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
    supplier_product_id: string; purchase_price: number | null; effective_from: string
  }>(() => db
    .from('price_snapshots')
    .select('supplier_product_id, purchase_price, effective_from')
    .in('supplier_product_id', spIds)
    .order('effective_from', { ascending: false }))

  // 품목별로 effective_from 내림차순 목록을 만들어 둔다.
  const byProduct = new Map<string, { from: string; cost: number }[]>()
  for (const s of snaps) {
    const pid = spToProduct.get(s.supplier_product_id)
    const cost = Number(s.purchase_price ?? 0)
    if (!pid || !(cost > 0)) continue
    const arr = byProduct.get(pid)
    if (arr) arr.push({ from: s.effective_from, cost })
    else byProduct.set(pid, [{ from: s.effective_from, cost }])
  }

  return {
    costOf(productId: string, businessDate: string) {
      const arr = byProduct.get(productId)
      if (!arr?.length) return null
      for (const row of arr) {
        if (row.from <= businessDate) return row.cost
      }
      return null
    },
  }
}
