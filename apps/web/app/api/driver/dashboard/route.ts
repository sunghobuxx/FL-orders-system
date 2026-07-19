export const runtime = 'edge'

import { NextResponse } from 'next/server'

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

  const dispatches = (dispatchesRes.data ?? []).map((job: any) => {
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
