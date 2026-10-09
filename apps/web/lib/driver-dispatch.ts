import { getCurrentDispatchGroups, getDispatchJobItemRows, groupEditableRows, type DispatchOrderItem } from './dispatch/current-items'
import type { createAdminClient } from './supabase/admin'

export async function loadDriverDispatch(db: ReturnType<typeof createAdminClient>, businessDate: string, assignedIds: string[] | null) {
  const { allItems, garakItems, grouped, inactiveGrouped, unmappedItems } = await getCurrentDispatchGroups(db, businessDate)
  const current = [...new Map([...allItems, ...garakItems].map(item => [item.id, item])).values()]
  // Shared web routing can include a Garak row in a common supplier's message.
  // Mobile tabs represent purchase sources, so display that order row only in Garak.
  const garakIds = new Set(garakItems.map(item => item.id))
  const supplierGroups = Object.fromEntries(Object.entries({ ...grouped, ...inactiveGrouped })
    .map(([id, items]) => [id, items.filter(item => !garakIds.has(item.id))] as const)
    .filter(([, items]) => items.length))
  const supplierIds = Object.keys(supplierGroups)
  const [jobsRes, suppliersRes, itemsRes] = await Promise.all([
    supplierIds.length ? db.from('dispatch_jobs').select('id, supplier_id, status').eq('business_date', businessDate).in('supplier_id', supplierIds) : { data: [], error: null },
    supplierIds.length ? db.from('suppliers').select('id, organizations(name)').in('id', supplierIds) : { data: [], error: null },
    current.length ? db.from('order_items').select('id, unit_price_snapshot, orders(batch_id, order_batches(status, restaurant_id))').in('id', current.map(i => i.id)) : { data: [], error: null },
  ])
  for (const result of [jobsRes, suppliersRes, itemsRes]) if (result.error) throw result.error
  const one = (value: any) => Array.isArray(value) ? value[0] : value
  const meta = new Map((itemsRes.data ?? []).map((item: any) => {
    const order = one(item.orders)
    const batch = one(order?.order_batches)
    return [item.id, { batchId: order?.batch_id ?? '', batchStatus: batch?.status ?? '', unitPrice: Number(item.unit_price_snapshot ?? 0), canManage: !!order?.batch_id && (assignedIds === null || assignedIds.includes(batch?.restaurant_id)) }] as const
  }))
  const row = (item: DispatchOrderItem) => ({
    orderItemId: item.id, name: item.products?.standard_name ?? '품목', restaurantName: item.restaurant_name ?? '',
    qty: Number(item.qty), unit: item.unit, checkStage: Number(item.check_stage ?? 0),
    batchId: '', batchStatus: item.batch_status ?? '', canManage: false, unitPrice: 0, ...meta.get(item.id),
  })
  const totalsMap = new Map<string, { productId: string; name: string; unit: string; qty: number; amount: number }>()
  for (const item of current) {
    const key = `${item.product_id}:${item.unit}`
    const total = totalsMap.get(key) ?? { productId: item.product_id, name: item.products?.standard_name ?? '품목', unit: item.unit, qty: 0, amount: 0 }
    total.qty += Number(item.qty)
    total.amount += Number(item.qty) * (meta.get(item.id)?.unitPrice ?? 0)
    totalsMap.set(key, total)
  }
  const fmt = (qty: number, unit: string) => `${Number(qty.toFixed(2))} ${unit}`
  const totals = [...totalsMap.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'ko')).map(i => ({ ...i, qtyText: fmt(i.qty, i.unit) }))
  const suppliers = await Promise.all(supplierIds.map(async supplierId => {
    const job = (jobsRes.data ?? []).find(j => j.supplier_id === supplierId)
    const supplier = (suppliersRes.data ?? []).find(s => s.id === supplierId)
    // Match the web: use saved quantities/exclusions if rows exist, otherwise current orders.
    const currentIds = new Set(supplierGroups[supplierId].map(item => item.id))
    // Old dispatch snapshots must not resurrect rows moved to Garak/another supplier.
    const saved = (job ? await getDispatchJobItemRows(db, job.id) : []).filter(item => currentIds.has(item.orderItemId))
    const currentRows = supplierGroups[supplierId].map(row)
    const groups = saved.length ? groupEditableRows(saved) : groupEditableRows(currentRows.map(i => ({
      id: i.orderItemId, orderItemId: i.orderItemId, productId: supplierGroups[supplierId].find(x => x.id === i.orderItemId)!.product_id,
      productName: i.name, restaurantName: i.restaurantName, qty: i.qty, orderQty: i.qty, unit: i.unit, checkStage: i.checkStage, excluded: false, overridden: false,
    })))
    const inactive = supplierId in inactiveGrouped
    return {
      supplierId, supplierName: one(supplier?.organizations)?.name ?? '알 수 없음', status: job?.status ?? 'pending', sent: job?.status === 'sent', autoDispatchExcluded: inactive,
      lines: groups.map(g => ({
        name: g.name, qty: g.qty, unit: g.unit, qtyText: fmt(g.qty, g.unit),
        rows: g.rows.map(i => ({
          orderItemId: i.orderItemId, name: g.name, restaurantName: i.restaurantName, qty: i.excluded ? 0 : i.qty, unit: i.unit, checkStage: i.checkStage,
          batchId: '', batchStatus: '', canManage: false, unitPrice: 0, ...meta.get(i.orderItemId), excluded: i.excluded,
        })),
      })),
    }
  }))
  return { businessDate, totals, totalAmount: totals.reduce((sum, i) => sum + i.amount, 0), garakItems: garakItems.map(row), suppliers, unmappedItems: unmappedItems.map(i => ({ ...i, qtyText: fmt(i.qty, i.unit) })) }
}
