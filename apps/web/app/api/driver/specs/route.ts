export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { addDays, applyAssignedFilter, getKstToday, orgNameFromRestaurant, requireDriverUser } from '@/lib/driver-api'
import { NO_PRICE_STATUS, displayFor, type PriceStatusResult } from '@/lib/pricing/price-status'
import { loadSpecStatuses } from '@/lib/pricing/price-status-loader'

export async function GET(req: Request) {
  const ctx = await requireDriverUser(req)
  if ('error' in ctx) return ctx.error

  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') ?? 'today'
  const date = url.searchParams.get('date') ?? getKstToday()
  const from = mode === 'history' ? (url.searchParams.get('from') ?? addDays(date, -30)) : date
  const to = mode === 'history' ? (url.searchParams.get('to') ?? date) : date

  const query = applyAssignedFilter(
    ctx.db
      .from('daily_specs')
      .select('id, restaurant_id, business_date, total_amount, restaurants(organizations(name)), daily_spec_lines(id, qty, unit, unit_price, amount, products(standard_name))')
      .gte('business_date', from)
      .lte('business_date', to)
      .order('business_date', { ascending: false }),
    ctx.assignedRestaurantIds,
  )

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 단가 확정 상태 — 부가 정보라서 조회가 실패해도 명세서 목록은 그대로 응답한다.
  // 배송앱은 전날 명세서를 골라 인쇄하므로 오래된 미확정 날짜도 표시한다(displayFor 의 driver 규칙).
  let statusBySpec = new Map<string, PriceStatusResult>()
  try {
    statusBySpec = await loadSpecStatuses(
      ctx.db, (data ?? []).map((s: any) => ({ id: s.id as string, business_date: s.business_date as string })))
  } catch (e) {
    console.error('[driver/specs] 단가 확정 상태 조회 실패', e)
  }
  const kstToday = getKstToday()

  const restaurantIds = [...new Set((data ?? []).map((spec: any) => spec.restaurant_id as string))]
  const receivableBalanceByRestaurant = new Map<string, number>()

  if (restaurantIds.length > 0) {
    const { data: receivables } = await ctx.db
      .from('receivables')
      .select('restaurant_id, balance')
      .in('restaurant_id', restaurantIds)
      .in('status', ['unpaid', 'partial', 'overdue'])

    for (const receivable of receivables ?? []) {
      const restaurantId = receivable.restaurant_id as string
      const previous = receivableBalanceByRestaurant.get(restaurantId) ?? 0
      receivableBalanceByRestaurant.set(restaurantId, previous + Number(receivable.balance ?? 0))
    }
  }

  return NextResponse.json({
    date,
    from,
    to,
    mode,
    specs: (data ?? []).map((spec: any) => {
      const totalAmount = Number(spec.total_amount ?? 0)
      const outstanding = receivableBalanceByRestaurant.get(spec.restaurant_id) ?? 0
      const shown = displayFor(statusBySpec.get(spec.id) ?? NO_PRICE_STATUS, spec.business_date,
        { audience: 'driver', today: kstToday })

      return {
        id: spec.id,
        restaurantId: spec.restaurant_id,
        restaurantName: orgNameFromRestaurant(spec),
        businessDate: spec.business_date,
        totalAmount,
        previousOutstanding: Math.max(0, outstanding - totalAmount),
        outstanding,
        itemCount: spec.daily_spec_lines?.length ?? 0,
        priceStatus: shown ? { status: shown.status, at: shown.at } : undefined,
        lines: (spec.daily_spec_lines ?? []).map((line: any) => {
          const product = Array.isArray(line.products) ? line.products[0] : line.products
          return {
            id: line.id,
            productName: product?.standard_name ?? '품목',
            qty: Number(line.qty ?? 0),
            unit: line.unit ?? '',
            unitPrice: Number(line.unit_price ?? 0),
            amount: Number(line.amount ?? 0),
          }
        }),
      }
    }),
  })
}
