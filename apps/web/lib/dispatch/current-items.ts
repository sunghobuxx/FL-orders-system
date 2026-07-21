/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DispatchOrderItem {
  id: string
  product_id: string
  qty: number
  unit: string
  supplier_product_id: string | null
  products: { standard_name: string } | null
  restaurant_name: string | null
}

export interface DispatchLine {
  name: string
  qty: number
  unit: string
  byRestaurant: { name: string; qty: number }[]
}

export const DISPATCH_ORDER_STATUSES = ['submitted', 'validated', 'ordered', 'dispatched', 'completed']

function formatQty(qty: number) {
  return qty % 1 === 0 ? String(qty) : qty.toFixed(1)
}

async function resolveSupplierMaps(adminDb: any, items: DispatchOrderItem[]) {
  const productIds = [...new Set(items.map(i => i.product_id).filter(Boolean))]
  const supplierProductIds = [...new Set(items.map(i => i.supplier_product_id).filter(Boolean) as string[])]

  const [{ data: productSupplierRows }, { data: supplierProductRows }] = await Promise.all([
    productIds.length
      ? adminDb
          .from('supplier_products')
          .select('id, product_id, supplier_id, updated_at')
          .in('product_id', productIds)
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    supplierProductIds.length
      ? adminDb.from('supplier_products').select('id, supplier_id').in('id', supplierProductIds)
      : Promise.resolve({ data: [] }),
  ])

  const productToSupplier: Record<string, string> = {}
  for (const row of productSupplierRows ?? []) {
    if (!productToSupplier[row.product_id]) {
      productToSupplier[row.product_id] = row.supplier_id
    }
  }

  const supplierProductToSupplier = Object.fromEntries(
    (supplierProductRows ?? []).map((row: { id: string; supplier_id: string }) => [row.id, row.supplier_id]),
  )

  return { productToSupplier, supplierProductToSupplier }
}

export async function getCurrentDispatchGroups(
  adminDb: any,
  businessDate: string,
  options: { batchStatuses?: string[] } = {},
) {
  let batchQuery = adminDb
    .from('order_batches')
    .select('id, business_date, restaurant_id')
    .eq('business_date', businessDate)

  if (options.batchStatuses?.length) {
    batchQuery = batchQuery.in('status', options.batchStatuses)
  } else {
    // 작성 중(open) 주문만 제외하고, 배송 완료 후에도 발주 집계가 사라지지 않게 한다.
    batchQuery = batchQuery.in('status', DISPATCH_ORDER_STATUSES)
  }

  const { data: batches } = await batchQuery
  const batchIds = (batches ?? []).map((b: { id: string }) => b.id)
  if (!batchIds.length) {
    return { batches: [], allItems: [] as DispatchOrderItem[], grouped: {}, inactiveGrouped: {}, unmappedItems: [] as DispatchLine[] }
  }

  // 레스토랑 → 업체명 맵 + 주문 목록을 병렬로 조회
  const restaurantIds = [...new Set((batches ?? []).map((b: { restaurant_id: string }) => b.restaurant_id).filter(Boolean) as string[])]
  const orderToRestaurantName: Record<string, string> = {}

  if (restaurantIds.length) {
    const [{ data: rRows }, { data: orderRows }] = await Promise.all([
      adminDb.from('restaurants').select('id, organization_id').in('id', restaurantIds),
      adminDb.from('orders').select('id, batch_id').in('batch_id', batchIds),
    ])

    const orgIds = [...new Set((rRows ?? []).map((r: { organization_id: string }) => r.organization_id).filter(Boolean) as string[])]
    const { data: orgRows } = orgIds.length
      ? await adminDb.from('organizations').select('id, name').in('id', orgIds)
      : { data: [] }

    const orgNameMap: Record<string, string> = Object.fromEntries(
      (orgRows ?? []).map((o: { id: string; name: string }) => [o.id, o.name])
    )
    const restaurantNameMap: Record<string, string> = Object.fromEntries(
      (rRows ?? []).map((r: { id: string; organization_id: string }) => [r.id, orgNameMap[r.organization_id] ?? ''])
    )
    const batchRestaurantMap: Record<string, string> = Object.fromEntries(
      (batches ?? []).map((b: { id: string; restaurant_id: string }) => [b.id, restaurantNameMap[b.restaurant_id] ?? ''])
    )

    for (const o of orderRows ?? []) {
      orderToRestaurantName[o.id] = batchRestaurantMap[o.batch_id] ?? ''
    }
  }

  const orderIds = Object.keys(orderToRestaurantName)
  if (!orderIds.length) {
    return { batches: batches ?? [], allItems: [] as DispatchOrderItem[], grouped: {}, inactiveGrouped: {}, unmappedItems: [] as DispatchLine[] }
  }

  const { data: rawItems } = await adminDb
    .from('order_items')
    .select('id, product_id, qty, unit, supplier_product_id, order_id, products(standard_name)')
    .in('order_id', orderIds)

  const items: DispatchOrderItem[] = (rawItems ?? []).map((i: any) => ({
    id: i.id,
    product_id: i.product_id,
    qty: i.qty,
    unit: i.unit,
    supplier_product_id: i.supplier_product_id,
    products: i.products,
    restaurant_name: orderToRestaurantName[i.order_id] ?? null,
  }))

  if (!items.length) {
    return { batches: batches ?? [], allItems: [] as DispatchOrderItem[], grouped: {}, inactiveGrouped: {}, unmappedItems: [] as DispatchLine[] }
  }

  const { productToSupplier, supplierProductToSupplier } = await resolveSupplierMaps(adminDb, items)
  const grouped: Record<string, DispatchOrderItem[]> = {}
  const unmappedMap = new Map<string, DispatchLine>()

  for (const item of items) {
    const supplierId = item.supplier_product_id
      ? supplierProductToSupplier[item.supplier_product_id] ?? productToSupplier[item.product_id]
      : productToSupplier[item.product_id]

    if (!supplierId) {
      const name = item.products?.standard_name ?? item.product_id
      const key = `${item.product_id}:${item.unit}`
      const qty = Number(item.qty)
      const existing = unmappedMap.get(key)
      if (existing) {
        existing.qty += qty
      } else {
        unmappedMap.set(key, { name, qty, unit: item.unit, byRestaurant: [] })
      }
      continue
    }

    grouped[supplierId] ??= []
    grouped[supplierId].push(item)
  }

  // 비활성(inactive) 공급처는 메시지 발송 제외하되 발주 내역에는 표시
  const inactiveGrouped: Record<string, DispatchOrderItem[]> = {}
  const supplierIdsInGrouped = Object.keys(grouped)
  if (supplierIdsInGrouped.length > 0) {
    const { data: activeSupplierRows } = await adminDb
      .from('suppliers')
      .select('id')
      .in('id', supplierIdsInGrouped)
      .eq('status', 'active')
    const activeSet = new Set((activeSupplierRows ?? []).map((s: { id: string }) => s.id))
    for (const sid of supplierIdsInGrouped) {
      if (!activeSet.has(sid)) {
        inactiveGrouped[sid] = grouped[sid]
        delete grouped[sid]
      }
    }
  }

  return { batches: batches ?? [], allItems: items, grouped, inactiveGrouped, unmappedItems: [...unmappedMap.values()] }
}

export async function syncDispatchJobItems(
  adminDb: any,
  dispatchJobId: string,
  groupItems: DispatchOrderItem[],
) {
  const { data: existingRows, error: readError } = await adminDb
    .from('dispatch_job_items')
    .select('id, order_item_id')
    .eq('dispatch_job_id', dispatchJobId)
  if (readError) throw readError

  const desiredByOrderItem = new Map(groupItems.map(item => [item.id, item]))
  const existingByOrderItem = new Map<string, { id: string; order_item_id: string }>(
    (existingRows ?? []).map((row: { id: string; order_item_id: string }) => [row.order_item_id, row]),
  )

  // 수동 제외 여부는 유지하면서 최신 수량과 추가 품목만 반영한다.
  // 전체 삭제 후 재삽입하지 않아 삽입 실패 시 발주 품목 전체가 사라지는 상황도 막는다.
  const staleIds = (existingRows ?? [])
    .filter((row: { order_item_id: string }) => !desiredByOrderItem.has(row.order_item_id))
    .map((row: { id: string }) => row.id)
  if (staleIds.length) {
    const { error } = await adminDb.from('dispatch_job_items').delete().in('id', staleIds)
    if (error) throw error
  }

  const existingUpdates = groupItems.filter(item => existingByOrderItem.has(item.id))
  const updateResults = await Promise.all(
    existingUpdates.map(item => adminDb
      .from('dispatch_job_items')
      .update({ qty: item.qty })
      .eq('id', existingByOrderItem.get(item.id)!.id)),
  )
  const updateError = updateResults.find(result => result.error)?.error
  if (updateError) throw updateError

  const missingItems = groupItems.filter(item => !existingByOrderItem.has(item.id))
  if (missingItems.length) {
    const { error } = await adminDb.from('dispatch_job_items').insert(
      missingItems.map(item => ({
        dispatch_job_id: dispatchJobId,
        order_item_id: item.id,
        qty: item.qty,
      })),
    )
    if (error) throw error
  }
}

// 발주 사전 확정된 job → dispatch_job_items에서 직접 메시지 라인 생성
export async function buildLinesFromDispatchJob(adminDb: any, jobId: string): Promise<DispatchLine[]> {
  const { data: rows } = await adminDb
    .from('dispatch_job_items')
    .select('qty, order_items(product_id, unit, products(standard_name), orders(order_batches(restaurants(organizations(name)))))')
    .eq('dispatch_job_id', jobId)
    .eq('is_excluded', false)

  const lineMap = new Map<string, DispatchLine>()
  for (const row of rows ?? []) {
    const oi = row.order_items as any
    if (!oi) continue
    const name = oi.products?.standard_name ?? '품목'
    const key = `${oi.product_id}:${oi.unit}:${name}`
    const qty = Number(row.qty)
    const rName = oi.orders?.order_batches?.restaurants?.organizations?.name ?? ''
    const existing = lineMap.get(key)
    if (existing) {
      existing.qty += qty
      if (rName) {
        const r = existing.byRestaurant.find(r => r.name === rName)
        if (r) r.qty += qty
        else existing.byRestaurant.push({ name: rName, qty })
      }
    } else {
      lineMap.set(key, { name, qty, unit: oi.unit ?? '', byRestaurant: rName ? [{ name: rName, qty }] : [] })
    }
  }
  return [...lineMap.values()]
}

export function buildDispatchLines(items: DispatchOrderItem[]): DispatchLine[] {
  const lineMap = new Map<string, DispatchLine>()

  for (const item of items) {
    const name = item.products?.standard_name ?? '품목'
    const key = `${item.product_id}:${item.unit}:${name}`
    const qty = Number(item.qty)
    const rName = item.restaurant_name ?? ''
    const existing = lineMap.get(key)

    if (existing) {
      existing.qty += qty
      const r = existing.byRestaurant.find(r => r.name === rName)
      if (r) r.qty += qty
      else if (rName) existing.byRestaurant.push({ name: rName, qty })
    } else {
      lineMap.set(key, {
        name,
        qty,
        unit: item.unit,
        byRestaurant: rName ? [{ name: rName, qty }] : [],
      })
    }
  }

  return [...lineMap.values()]
}

// 식당명 약칭: 마지막 단어만 사용 (예: "할매솥뚜껑삼겹살 고강점" → "고강점")
function shortName(name: string): string {
  const parts = name.trim().split(' ')
  return parts[parts.length - 1] || name
}

export function formatDispatchLine(line: DispatchLine, separator = ': ') {
  const total = `${line.name}${separator}${formatQty(line.qty)}${line.unit}`
  if (!line.byRestaurant?.length || line.byRestaurant.length <= 1) return total
  const breakdown = line.byRestaurant
    .map(r => `${shortName(r.name)} ${formatQty(r.qty)}${line.unit}`)
    .join(' / ')
  return `${total} (${breakdown})`
}
