export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { buildDispatchLines, getCurrentDispatchGroups } from '@/lib/dispatch/current-items'
import { addDays, applyAssignedFilter, getKstToday, orgNameFromRestaurant, requireDriverUser, DRIVER_NOTE_CATEGORY } from '@/lib/driver-api'

export async function GET(req: Request) {
  const ctx = await requireDriverUser(req)
  if ('error' in ctx) return ctx.error

  const today = getKstToday()
  const tomorrow = addDays(today, 1)
  const assignedQuery = applyAssignedFilter(
    ctx.db
      .from('order_batches')
      .select('id, restaurant_id, status, business_date, submitted_at, created_at, restaurants(organizations(name)), orders(order_items(id))')
      .in('business_date', [today, tomorrow])
      .order('business_date', { ascending: true })
      .order('submitted_at', { ascending: false, nullsFirst: false }),
    ctx.assignedRestaurantIds,
  )

  const [ordersRes, allOrdersRes, specsRes, notesRes, inquiriesRes, dispatchGroups] = await Promise.all([
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
      .select('id, title, content, status, created_at, organizations(name)')
      .eq('category', DRIVER_NOTE_CATEGORY)
      .order('created_at', { ascending: false })
      .limit(5),
    ctx.db
      .from('inquiries')
      .select('id, title, status, created_at, organizations(name)')
      .eq('status', 'open')
      .neq('category', DRIVER_NOTE_CATEGORY)
      .order('created_at', { ascending: false })
      .limit(5),
    getCurrentDispatchGroups(ctx.db, today),
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

  const dispatchGroupEntries = [
    ...Object.entries(dispatchGroups.grouped).map(([supplierId, items]) => ({ supplierId, items, inactive: false })),
    ...Object.entries(dispatchGroups.inactiveGrouped).map(([supplierId, items]) => ({ supplierId, items, inactive: true })),
  ]
  const supplierIds = dispatchGroupEntries.map(group => group.supplierId)
  const [supplierRowsRes, dispatchJobsRes] = await Promise.all([
    supplierIds.length
      ? ctx.db.from('suppliers').select('id, organizations(name)').in('id', supplierIds)
      : Promise.resolve({ data: [] }),
    supplierIds.length
      ? ctx.db.from('dispatch_jobs').select('id, supplier_id, status').eq('business_date', today).in('supplier_id', supplierIds)
      : Promise.resolve({ data: [] }),
  ])
  const supplierNameMap = new Map(
    (supplierRowsRes.data ?? []).map((supplier: any) => {
      const organization = Array.isArray(supplier.organizations) ? supplier.organizations[0] : supplier.organizations
      return [supplier.id as string, organization?.name ?? '알 수 없음'] as [string, string]
    }),
  )
  const jobMap = new Map(
    (dispatchJobsRes.data ?? []).map((job: any) => [job.supplier_id as string, job]),
  )
  const dispatches = dispatchGroupEntries.map(group => {
    const job = jobMap.get(group.supplierId)
    return {
      id: job?.id ?? `${today}-${group.supplierId}`,
      supplierName: supplierNameMap.get(group.supplierId) ?? '알 수 없음',
      businessDate: today,
      status: group.inactive ? 'inactive' : (job?.status ?? 'pending'),
      sent: !group.inactive && ['sent', 'completed'].includes(job?.status ?? ''),
      items: buildDispatchLines(group.items).map(line => ({
        name: line.name,
        qty: line.qty,
        unit: line.unit,
      })),
    }
  })
  if (dispatchGroups.unmappedItems.length) {
    dispatches.push({
      id: `${today}-unmapped`,
      supplierName: '공급처 미배정',
      businessDate: today,
      status: 'pending',
      sent: false,
      items: dispatchGroups.unmappedItems.map(line => ({
        name: line.name,
        qty: line.qty,
        unit: line.unit,
      })),
    })
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
