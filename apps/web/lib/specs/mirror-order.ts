/* eslint-disable @typescript-eslint/no-explicit-any */
import { normalizeUnit } from '@/lib/units'
import type { PackSpec } from '@/lib/products/pack-size'

/**
 * 관리자가 명세서에서 고친 수량을 발주 품목(order_items)에도 적는 규칙.
 *
 * 명세서 줄이 잠겨 있어도 수량은 재동기화 때 **최신 발주 수량**을 따른다(kept-line.ts). 그래서 관리자가 손으로 고친 수량이
 * 발주에도 적혀 있어야 나중에 다시 맞춰도 되돌아가지 않는다. 예전 update-spec-line 은 두 경우에 이걸 못 했다.
 *  - 발주 연결(order_item_id)이 끊긴 줄 — 배치를 지웠다 다시 만들었거나 옛 작업으로 끊긴 줄(7월 기준 38%).
 *  - 발주는 kg, 명세서는 포장 단위인 품목 — 고추 10kg=1박스를 앱이 kg 으로 발주하면 명세서는 1박스로 바뀐다.
 *    관리자가 10박스로 고쳤는데 발주에 「10 kg」 이 적히면 다시 맞출 때 1박스가 된다.
 */

export interface OrderItemRef { id: string; qty: number; unit: string }

/** 명세서 줄 수량을 발주 품목에 옮길 값. 옮길 수 없으면 null(엉뚱한 수량을 쓰지 않는다). */
export function orderQtyForSpecLine(
  specQty: number,
  specUnit: string | null,
  item: OrderItemRef,
  pack: PackSpec | null | undefined,
): { qty: number; mirrorPrice: boolean } | null {
  if (!Number.isFinite(specQty) || specQty <= 0) return null
  const specU = normalizeUnit(specUnit)
  const itemU = normalizeUnit(item.unit)
  if (!specU || specU === itemU) return { qty: specQty, mirrorPrice: true }

  // 발주는 kg, 명세서는 포장 단위 → kg 로 환산. 단가 기록은 단위가 달라 옮기지 않는다.
  const perPack = Number(pack?.kg_per_pack ?? 0)
  if (itemU === 'kg' && pack?.pack_unit && normalizeUnit(pack.pack_unit) === specU && perPack > 0) {
    return { qty: specQty * perPack, mirrorPrice: false }
  }
  return null
}

/**
 * 발주 연결이 끊긴 명세서 줄의 발주 품목을 찾는다. 그날 그 식당 발주에 그 품목이 **딱 하나**일 때만 돌려준다.
 * 없으면(관리자가 손으로 넣은 품목) 또는 둘 이상이면(어느 것인지 모름) null.
 */
export async function findOrderItemForLine(
  db: any,
  args: { restaurantId: string; businessDate: string; productId: string },
): Promise<OrderItemRef | null> {
  const { data: batches } = await db
    .from('order_batches').select('id')
    .eq('restaurant_id', args.restaurantId).eq('business_date', args.businessDate)
  const batchIds = (batches ?? []).map((b: { id: string }) => b.id)
  if (!batchIds.length) return null

  const { data: orders } = await db.from('orders').select('id').in('batch_id', batchIds)
  const orderIds = (orders ?? []).map((o: { id: string }) => o.id)
  if (!orderIds.length) return null

  const { data: items } = await db
    .from('order_items').select('id, qty, unit')
    .in('order_id', orderIds).eq('product_id', args.productId)
  return items?.length === 1 ? (items[0] as OrderItemRef) : null
}
