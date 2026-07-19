export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { addDays, applyAssignedFilter, getKstToday, orgNameFromRestaurant, requireDriverUser } from '@/lib/driver-api'

const STATUS_LABEL: Record<string, string> = {
  open: '작성 중',
  submitted: '당일발주',
  validated: '알림톡 발송',
  ordered: '배송중',
  dispatched: '배송완료',
  completed: '완료',
}

export async function GET(req: Request) {
  const ctx = await requireDriverUser(req)
  if ('error' in ctx) return ctx.error

  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') ?? 'today'
  const date = url.searchParams.get('date') ?? getKstToday()
  const from = mode === 'history' ? (url.searchParams.get('from') ?? addDays(date, -30)) : date
  const to = mode === 'history' ? (url.searchParams.get('to') ?? date) : date

  let query = ctx.db
    .from('order_batches')
    .select('id, restaurant_id, status, business_date, submitted_at, created_at, restaurants(organizations(name)), orders(order_items(id, qty, unit, amount, products(standard_name)))')
    .gte('business_date', from)
    .lte('business_date', to)
    .order('business_date', { ascending: false })
    .order('submitted_at', { ascending: false, nullsFirst: false })

  if (mode !== 'history') {
    query = applyAssignedFilter(query, ctx.assignedRestaurantIds)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    date,
    from,
    to,
    mode,
    orders: (data ?? []).map((batch: any) => {
      const items = (batch.orders ?? []).flatMap((order: any) => order.order_items ?? [])
      const amount = items.reduce((sum: number, item: any) => sum + Number(item.amount ?? 0), 0)
      return {
        id: batch.id,
        restaurantId: batch.restaurant_id,
        restaurantName: orgNameFromRestaurant(batch),
        status: batch.status,
        statusLabel: STATUS_LABEL[batch.status] ?? batch.status,
        businessDate: batch.business_date,
        itemCount: items.length,
        amount,
        submittedAt: batch.submitted_at ?? batch.created_at,
      }
    }),
  })
}
