export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { addDays, applyAssignedFilter, getKstToday, orgNameFromRestaurant, requireDriverUser, DRIVER_NOTE_CATEGORY } from '@/lib/driver-api'
import { normalizeUnit } from '@/lib/units'

export async function GET(req: Request) {
  const ctx = await requireDriverUser(req)
  if ('error' in ctx) return ctx.error

  const today = getKstToday()
  const tomorrow = addDays(today, 1)
  const [, month, day] = today.split('-').map(Number)
  const todayNoteTitle = `${month}월 ${day}일`
  const assignedQuery = applyAssignedFilter(
    ctx.db
      .from('order_batches')
      .select('id, restaurant_id, status, business_date, submitted_at, created_at, restaurants(organizations(name)), orders(order_items(id))')
      .in('business_date', [today, tomorrow])
      .order('business_date', { ascending: true })
      .order('submitted_at', { ascending: false, nullsFirst: false }),
    ctx.assignedRestaurantIds,
  )

  const [ordersRes, allOrdersRes, specsRes, notesRes, inquiriesRes, dispatchesRes] = await Promise.all([
    assignedQuery,
    ctx.db
      .from('order_batches')
      .select('id, status, business_date')
      .in('business_date', [today, tomorrow]),
    applyAssignedFilter(
      ctx.db
        .from('daily_specs')
        .select('id, restaurant_id, business_date, total_amount, restaurants(organizations(name))')
        .eq('business_date', today),
      ctx.assignedRestaurantIds,
    ),
    ctx.db
      .from('inquiries')
      .select('id, title, created_at')
      .eq('category', DRIVER_NOTE_CATEGORY)
      .ilike('title', `%${todayNoteTitle}%`)
      .order('created_at', { ascending: false })
      .limit(5),
    ctx.db
      .from('inquiries')
      .select('id, title, status, created_at, organizations(name)')
      .eq('status', 'open')
      .neq('category', DRIVER_NOTE_CATEGORY)
      .order('created_at', { ascending: false })
      .limit(5),
    ctx.db
      .from('dispatch_jobs')
      .select('id, status, business_date, suppliers(organizations(name)), dispatch_job_items(qty, order_items(unit, products(standard_name)))')
      .in('business_date', [today, tomorrow]),
  ])

  const orders = (ordersRes.data ?? []).map((batch: any) => ({
    id: batch.id,
    restaurantId: batch.restaurant_id,
    restaurantName: orgNameFromRestaurant(batch),
    status: batch.status,
    businessDate: batch.business_date,
    itemCount: (batch.orders ?? []).reduce((sum: number, order: any) => sum + (order.order_items?.length ?? 0), 0),
    submittedAt: batch.submitted_at ?? batch.created_at,
  }))

  let dispatches = (dispatchesRes.data ?? []).map((job: any) => {
    const supplier = Array.isArray(job.suppliers?.organizations)
      ? job.suppliers?.organizations[0]
      : job.suppliers?.organizations
    const itemMap = new Map<string, { name: string; qty: number; unit: string }>()

    for (const item of job.dispatch_job_items ?? []) {
      const product = Array.isArray(item.order_items?.products)
        ? item.order_items?.products[0]
        : item.order_items?.products
      const name = product?.standard_name ?? '품목'
      const unit = item.order_items?.unit ?? ''
      const key = `${name}-${unit}`
      const prev = itemMap.get(key) ?? { name, qty: 0, unit }
      prev.qty += Number(item.qty ?? 0)
      itemMap.set(key, prev)
    }

    return {
      id: job.id,
      supplierName: supplier?.name ?? '알 수 없음',
      businessDate: job.business_date,
      status: job.status,
      sent: ['sent', 'completed'].includes(job.status),
      items: [...itemMap.values()],
    }
  })

  // 자동 발송 작업은 새벽에 생성된다. 작업이 아직 없더라도 오늘/내일 주문 품목을
  // 공급처별로 집계해 웹 관리자 대시보드와 같은 발주 내역을 보여준다.
  const dispatchDates = new Set(dispatches.map(dispatch => dispatch.businessDate))
  const fallbackOrders = orders.filter(order => !dispatchDates.has(order.businessDate))
  if (fallbackOrders.length > 0) {
    const batchIds = fallbackOrders.map(order => order.id)
    const batchDates = new Map(fallbackOrders.map(order => [order.id, order.businessDate]))
    const { data: orderItems } = await ctx.db
      .from('order_items')
      .select('qty, unit, product_id, products(standard_name), orders!inner(batch_id)')
      .in('orders.batch_id', batchIds)

    const productIds = [...new Set((orderItems ?? []).map(item => item.product_id))]
    if (productIds.length > 0) {
      const { data: supplierProducts } = await ctx.db
        .from('supplier_products')
        .select('product_id, supplier_id, updated_at')
        .in('product_id', productIds)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })

      const productToSupplier = new Map<string, string>()
      for (const row of supplierProducts ?? []) {
        if (!productToSupplier.has(row.product_id)) productToSupplier.set(row.product_id, row.supplier_id)
      }

      const supplierIds = [...new Set(productToSupplier.values())]
      const { data: suppliers } = supplierIds.length > 0
        ? await ctx.db.from('suppliers').select('id, organizations(name)').in('id', supplierIds)
        : { data: [] }
      const supplierNames = new Map((suppliers ?? []).map(supplier => {
        const organization = Array.isArray(supplier.organizations)
          ? supplier.organizations[0]
          : supplier.organizations
        return [supplier.id, organization?.name ?? '알 수 없음']
      }))

      const grouped = new Map<string, { supplierId: string; businessDate: string; items: Map<string, { name: string; qty: number; unit: string }> }>()
      for (const item of orderItems ?? []) {
        const supplierId = productToSupplier.get(item.product_id)
        if (!supplierId) continue
        const order = Array.isArray(item.orders) ? item.orders[0] : item.orders
        const businessDate = batchDates.get(order?.batch_id)
        if (!businessDate) continue
        const product = Array.isArray(item.products) ? item.products[0] : item.products
        const name = product?.standard_name ?? '품목'
        const unit = normalizeUnit(item.unit) ?? ''
        const itemKey = `${name}-${unit}`
        const groupKey = `${businessDate}-${supplierId}`
        const group = grouped.get(groupKey) ?? { supplierId, businessDate, items: new Map() }
        const current = group.items.get(itemKey) ?? { name, qty: 0, unit }
        current.qty += Number(item.qty ?? 0)
        group.items.set(itemKey, current)
        grouped.set(groupKey, group)
      }

      const fallbackDispatches = [...grouped.entries()].map(([groupKey, group]) => ({
        id: `pending-${groupKey}`,
        supplierName: supplierNames.get(group.supplierId) ?? '알 수 없음',
        businessDate: group.businessDate,
        status: 'pending',
        sent: false,
        items: [...group.items.values()],
      }))
      dispatches = [...dispatches, ...fallbackDispatches]
    }
  }

  const specs = (specsRes.data ?? []).map((spec: any) => ({
    id: spec.id,
    restaurantId: spec.restaurant_id,
    restaurantName: orgNameFromRestaurant(spec),
    businessDate: spec.business_date,
    totalAmount: Number(spec.total_amount ?? 0),
  }))

  return NextResponse.json({
    today,
    tomorrow,
    role: ctx.role,
    assignedRestaurantCount: ctx.assignedRestaurantIds?.length ?? null,
    orders,
    totalAssignedOrders: orders.length,
    totalAllOrders: allOrdersRes.data?.length ?? 0,
    specs,
    notes: notesRes.data ?? [],
    inquiries: inquiriesRes.data ?? [],
    dispatches,
  })
}
