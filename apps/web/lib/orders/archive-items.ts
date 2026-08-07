/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 발주 품목을 지우기 전에 order_items_archive 로 옮겨 둔다.
 *
 * 회원 발주 저장은 기존 order_items 를 **전부 지우고 다시 넣는** 방식이다.
 * 마감 전 재발주를 상정한 동작인데, 엉뚱한 날짜 배치에 걸리면 그날 발주가 통째로
 * 사라진다. 2026-07-28 고강점 사고 때 6/19 발주가 그렇게 교체됐고, 원본은 DB
 * 어디에도 남지 않아 되살릴 수 없었다.
 *
 * 이 표가 있으면 최소한 되돌릴 수는 있다. 다만 이건 사후 수습이고, 애초에 지난
 * 날짜로 저장이 들어오지 못하게 막는 검사가 본 방어다(route.ts 의 businessDate 검사).
 *
 * archive 표에는 amount·memo 칼럼이 없다. 금액은 qty × unit_price_snapshot 로
 * 되살아나지만 memo 는 남지 않는다.
 */

export interface ArchiveResult {
  archived: number
}

/**
 * @param orderId  지워지기 직전의 주문
 * @param reason   왜 보관했는지. 기본은 재발주로 인한 교체.
 * @throws 보관에 실패하면 던진다. 조용히 넘어가면 곧바로 삭제가 이어져
 *         보관을 넣은 뜻이 없어진다. supabase 는 insert 가 실패해도 예외를
 *         던지지 않으므로 error 를 직접 봐야 한다.
 */
export async function archiveOrderItems(
  db: any,
  orderId: string | null,
  reason = 'resubmit',
): Promise<ArchiveResult> {
  if (!orderId) return { archived: 0 }

  const { data: items, error: itemsError } = await db
    .from('order_items')
    .select('id, order_id, product_id, supplier_product_id, qty, unit, unit_price_snapshot')
    .eq('order_id', orderId)
  if (itemsError) throw new Error(`발주 품목 보관 실패(조회): ${itemsError.message}`)
  if (!items?.length) return { archived: 0 }

  // 어느 업체의 며칠치였는지는 order_batches 에만 있다. 나중에 사고를 되짚을 때
  // 주문 id 만으로는 찾을 수가 없어 archive 표가 따로 들고 있는다.
  const { data: order, error: orderError } = await db
    .from('orders')
    .select('batch_id, order_batches(restaurant_id, business_date)')
    .eq('id', orderId)
    .maybeSingle()
  if (orderError) throw new Error(`발주 품목 보관 실패(주문 조회): ${orderError.message}`)

  const batch = Array.isArray(order?.order_batches) ? order?.order_batches[0] : order?.order_batches

  const rows = items.map((item: any) => ({
    order_item_id: item.id,
    order_id: item.order_id,
    batch_id: order?.batch_id ?? null,
    restaurant_id: batch?.restaurant_id ?? null,
    business_date: batch?.business_date ?? null,
    product_id: item.product_id,
    qty: item.qty,
    unit: item.unit,
    unit_price_snapshot: item.unit_price_snapshot,
    supplier_product_id: item.supplier_product_id,
    reason,
  }))

  const { error: insertError } = await db.from('order_items_archive').insert(rows)
  if (insertError) throw new Error(`발주 품목 보관 실패(저장): ${insertError.message}`)

  return { archived: rows.length }
}
