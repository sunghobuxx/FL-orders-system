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

/**
 * 이미 만들어져 있는 그날 발주 job 의 품목을 지금 발주 내용에 맞춘다.
 *
 * 화면의 «당일 발주 집계» 는 order_items 를 실시간으로 읽는데,
 * «공급처별 발주 내역» 은 확정 시점에 떠 둔 dispatch_job_items 를 본다.
 * 그래서 02:30 자동발주 뒤에 품목을 추가하면 집계에는 뜨는데 공급처별 내역에는 없다.
 * (2026-08-08: 돈마나·돈독푸드에 04:2x 에 추가한 7 건이 신우상회·기타매입처 내역에서 빠졌다)
 *
 * job 을 새로 만들지 않고 **이미 있는 것만** 채운다. 문자도 보내지 않는다.
 * 사람이 고친 수량(qty_overridden)은 syncDispatchJobItems 가 그대로 둔다.
 */
export async function refreshDispatchJobItems(adminDb: any, businessDate: string): Promise<number> {
  const { data: jobs } = await adminDb
    .from('dispatch_jobs')
    .select('id, supplier_id')
    .eq('business_date', businessDate)
  if (!jobs?.length) return 0

  const { grouped } = await getCurrentDispatchGroups(adminDb, businessDate)
  let synced = 0
  for (const job of jobs as { id: string; supplier_id: string }[]) {
    const items = grouped[job.supplier_id]
    if (!items?.length) continue
    try {
      await syncDispatchJobItems(adminDb, job.id, items)
      synced++
    } catch (e) {
      // 한 곳이 실패해도 나머지는 맞춘다. 발주 저장 자체를 되돌리지는 않는다.
      console.error('[refreshDispatchJobItems] 동기화 실패', job.supplier_id, businessDate, e)
    }
  }
  return synced
}

export async function syncDispatchJobItems(
  adminDb: any,
  dispatchJobId: string,
  groupItems: DispatchOrderItem[],
) {
  const { data: existingRows, error: readError } = await adminDb
    .from('dispatch_job_items')
    .select('id, order_item_id, qty_overridden')
    .eq('dispatch_job_id', dispatchJobId)
  if (readError) throw readError

  const desiredByOrderItem = new Map(groupItems.map(item => [item.id, item]))
  const existingByOrderItem = new Map<string, { id: string; order_item_id: string; qty_overridden?: boolean }>(
    (existingRows ?? []).map((row: { id: string; order_item_id: string; qty_overridden?: boolean }) => [row.order_item_id, row]),
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

  // qty_overridden 인 줄은 문자용으로 손수 고친 수량이라 발주 수량으로 되돌리지 않는다.
  // 이게 없으면 발송 직전 sync 가 매번 덮어써서 수정이 문자에 반영되지 않는다.
  const existingUpdates = groupItems.filter(item => {
    const row = existingByOrderItem.get(item.id)
    return row && !row.qty_overridden
  })
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

// 문자에 나갈 수량을 업체별로 하나씩 펼친 것. 화면에서 수정할 때 쓴다.
export interface DispatchEditableRow {
  id: string            // dispatch_job_items.id
  qty: number           // 문자에 나갈 수량
  orderQty: number      // 원래 발주 수량 (되돌릴 때 기준)
  overridden: boolean
  /** 문자에서 뺀 줄. 수정 화면에는 0 으로 남겨 되돌릴 수 있게 한다. */
  excluded: boolean
  unit: string
  productId: string
  productName: string
  restaurantName: string
  /** 확인 버튼용. dispatch_job_items.id 가 아니라 발주 품목 id 다. */
  orderItemId: string
  /** 0 미확인 / 1 상차확인 / 2 배송확인 */
  checkStage: number
}

export async function getDispatchJobItemRows(adminDb: any, jobId: string): Promise<DispatchEditableRow[]> {
  const { data: rows } = await adminDb
    .from('dispatch_job_items')
    // is_excluded 로 거르지 않는다. 제외한 줄도 화면에 0 으로 보여야 되돌릴 수 있다.
    // 문자 본문은 buildLinesFromDispatchJob 이 따로 걸러 만든다.
    .select('id, qty, qty_overridden, is_excluded, order_item_id, order_items(qty, product_id, unit, check_stage, products(standard_name), orders(order_batches(status, restaurants(organizations(name)))))')
    .eq('dispatch_job_id', jobId)

  return (rows ?? [])
    .filter((row: any) => row.order_items)
    .map((row: any) => {
      const oi = row.order_items
      return {
        id: row.id,
        qty: Number(row.qty),
        orderQty: Number(oi.qty),
        overridden: Boolean(row.qty_overridden),
        excluded: Boolean(row.is_excluded),
        unit: oi.unit ?? '',
        productId: oi.product_id,
        productName: oi.products?.standard_name ?? '품목',
        restaurantName: oi.orders?.order_batches?.restaurants?.organizations?.name ?? '',
        orderItemId: row.order_item_id,
        checkStage: Number(oi.check_stage ?? 0),
      }
    })
}

// 수정 화면의 행들을 문자와 똑같은 모양으로 묶는다.
// buildLinesFromDispatchJob 과 키를 맞춰야 화면과 문자가 어긋나지 않는다.
export function groupEditableRows(rows: DispatchEditableRow[]) {
  const map = new Map<string, { name: string; unit: string; qty: number; rows: DispatchEditableRow[] }>()
  for (const row of rows) {
    const key = `${row.productId}:${row.unit}:${row.productName}`
    const q = row.excluded ? 0 : row.qty      // 뺀 줄은 합계에서 0 으로 센다
    const existing = map.get(key)
    if (existing) {
      existing.qty += q
      existing.rows.push(row)
    } else {
      map.set(key, { name: row.productName, unit: row.unit, qty: q, rows: [row] })
    }
  }
  return [...map.values()]
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
