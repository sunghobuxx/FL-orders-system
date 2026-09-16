export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { buildPriceMapByProduct } from '@/lib/specs/sync'
import { buildDashboardTrend, latestDashboardLine, productName, type DashboardLine } from '@/lib/member-dashboard'
import { getSupplyTrend } from '@/lib/market/summary'
import { toMarketName } from '@/lib/market/product-map'

type ProductRow = {
  product_id: string
  products: { standard_name: string; default_unit: string } | { standard_name: string; default_unit: string }[] | null
}

type SpecLine = {
  daily_spec_id: string
  product_id: string
  qty: number | null
  unit: string | null
  unit_price: number | null
  amount: number | null
  products: { standard_name: string } | { standard_name: string }[] | null
}

function unwrap<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

function kstDate(offsetDays = 0) {
  return new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const db = createAdminClient()
  const { data: userData, error: userError } = await db.auth.getUser(token)
  if (userError || !userData.user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: membership } = await db
    .from('memberships')
    .select('organization_id')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (!membership?.organization_id) {
    return NextResponse.json({ error: '업체 정보를 확인할 수 없습니다.' }, { status: 403 })
  }

  const { data: restaurant } = await db
    .from('restaurants')
    .select('id, organization_id')
    .eq('organization_id', membership.organization_id)
    .maybeSingle()
  if (!restaurant) {
    return NextResponse.json({ error: '식당 정보를 확인할 수 없습니다.' }, { status: 404 })
  }

  const today = kstDate()
  const kstNow = kstDate()
  const day = new Date(`${kstNow}T00:00:00Z`).getUTCDay()
  const mondayOffset = -(day === 0 ? 6 : day - 1)
  const weekStart = kstDate(mondayOffset)
  const recentRangeStart = kstDate(-13)

  const [productResult, specsResult, insightResult] = await Promise.all([
    db
      .from('restaurant_products')
      .select('product_id, products(standard_name, default_unit)')
      .eq('restaurant_id', restaurant.id)
      .order('display_order'),
    db
      .from('daily_specs')
      .select('id, business_date, total_amount')
      .eq('restaurant_id', restaurant.id)
      .gte('business_date', recentRangeStart)
      .lte('business_date', today)
      .order('business_date', { ascending: true }),
    db
      .from('weekly_insights')
      .select('insight_text, data_summary, model, created_at, week_start')
      .eq('restaurant_id', restaurant.id)
      .order('week_start', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (productResult.error) {
    return NextResponse.json({ error: `품목 조회 실패: ${productResult.error.message}` }, { status: 500 })
  }
  if (specsResult.error) {
    return NextResponse.json({ error: `납품 분석 조회 실패: ${specsResult.error.message}` }, { status: 500 })
  }
  if (insightResult.error) {
    return NextResponse.json({ error: `AI 분석 조회 실패: ${insightResult.error.message}` }, { status: 500 })
  }

  const products = (productResult.data ?? []) as unknown as ProductRow[]
  const productIds = products.map((row) => row.product_id)
  const { priceMap } = await buildPriceMapByProduct(
    db,
    productIds,
    today,
    restaurant.organization_id,
  )
  const prices = products.map((row) => {
    const product = unwrap(row.products)
    return {
      product_name: product?.standard_name ?? '품목',
      unit: product?.default_unit ?? '',
      price: Number(priceMap[row.product_id] ?? 0),
    }
  })

  const { data: supplierRows, error: supplierError } = productIds.length > 0
    ? await db
        .from('supplier_products')
        .select('product_id, price_snapshots(sale_price, effective_from)')
        .in('product_id', productIds)
        .eq('status', 'active')
    : { data: [], error: null }
  if (supplierError) {
    return NextResponse.json({ error: `단가 추이 조회 실패: ${supplierError.message}` }, { status: 500 })
  }

  const pricePointsByProduct = new Map<string, Array<{ date: string; qty: number; unit_price: number; cost: number }>>()
  for (const supplier of supplierRows ?? []) {
    const snapshots = (supplier.price_snapshots ?? []) as Array<{ sale_price: number; effective_from: string }>
    const sorted = snapshots
      .filter((snapshot) => snapshot.effective_from <= today && Number(snapshot.sale_price) > 0)
      .sort((a, b) => a.effective_from.localeCompare(b.effective_from))
    const baseline = [...sorted].reverse().find((snapshot) => snapshot.effective_from < recentRangeStart)
    const inRange = sorted.filter((snapshot) => snapshot.effective_from >= recentRangeStart)
    const selected = baseline ? [baseline, ...inRange] : inRange
    const existing = pricePointsByProduct.get(supplier.product_id) ?? []
    for (const snapshot of selected) {
      if (existing.some((point) => point.date === snapshot.effective_from && point.unit_price === Number(snapshot.sale_price))) continue
      existing.push({ date: snapshot.effective_from, qty: 0, unit_price: Number(snapshot.sale_price), cost: 0 })
    }
    existing.sort((a, b) => a.date.localeCompare(b.date))
    pricePointsByProduct.set(supplier.product_id, existing)
  }

  const specs = specsResult.data ?? []
  const specDate = new Map(specs.map((spec) => [spec.id, spec.business_date]))
  const specIds = specs.map((spec) => spec.id)
  const { data: lineData, error: lineError } = specIds.length > 0
    ? await db
        .from('daily_spec_lines')
        .select('daily_spec_id, product_id, qty, unit, unit_price, amount, products(standard_name)')
        .in('daily_spec_id', specIds)
    : { data: [], error: null }
  if (lineError) {
    return NextResponse.json({ error: `납품 품목 조회 실패: ${lineError.message}` }, { status: 500 })
  }

  type Accumulator = {
    product_name: string
    unit: string
    total_qty: number
    total_cost: number
    by_date: Map<string, { date: string; qty: number; unit_price: number; cost: number }>
  }
  const grouped = new Map<string, Accumulator>()
  for (const line of (lineData ?? []) as unknown as SpecLine[]) {
    const date = specDate.get(line.daily_spec_id)
    if (!date) continue
    const product = unwrap(line.products)
    const name = product?.standard_name ?? '품목'
    const qty = Number(line.qty ?? 0)
    const unitPrice = Number(line.unit_price ?? 0)
    const cost = Number(line.amount ?? qty * unitPrice)
    const item = grouped.get(line.product_id) ?? {
      product_name: name,
      unit: line.unit ?? '',
      total_qty: 0,
      total_cost: 0,
      by_date: new Map(),
    }
    item.total_qty += qty
    item.total_cost += cost
    const point = item.by_date.get(date) ?? { date, qty: 0, unit_price: unitPrice, cost: 0 }
    point.qty += qty
    point.cost += cost
    if (unitPrice > 0) point.unit_price = unitPrice
    item.by_date.set(date, point)
    grouped.set(line.product_id, item)
  }

  const weeklyItems = [...grouped.entries()].map(([productId, item]) => {
    const deliveryPoints = [...item.by_date.values()].sort((a, b) => a.date.localeCompare(b.date))
    const points = pricePointsByProduct.get(productId) ?? deliveryPoints
    const positivePrices = points.map((point) => point.unit_price).filter((price) => price > 0)
    const currentPrice = positivePrices.at(-1) ?? 0
    const previousPrice = positivePrices[0] ?? currentPrice
    return {
      product_name: item.product_name,
      unit: item.unit,
      total_qty: item.total_qty,
      total_cost: item.total_cost,
      current_price: currentPrice,
      previous_price: previousPrice,
      change_rate: previousPrice > 0 ? ((currentPrice - previousPrice) / previousPrice) * 100 : 0,
      order_days: deliveryPoints.length,
      points,
    }
  }).filter((item) => new Set(item.points.map((point) => point.unit_price).filter((price) => price > 0)).size > 1)
    .sort((a, b) => Math.abs(b.change_rate) - Math.abs(a.change_rate))

  // Additional web-parity payload; retain legacy fields for installed clients.
  const dashboardLines = (lineData ?? []) as unknown as DashboardLine[]
  const latestLine = latestDashboardLine(specs, dashboardLines)
  const [todayResult, yesterdayResult, monthResult, recentResult, balanceResult, inquiryResult, trendResult] = await Promise.all([
    db.from('order_batches').select('status').eq('restaurant_id', restaurant.id).eq('business_date', today).maybeSingle(),
    db.from('daily_specs').select('total_amount').eq('restaurant_id', restaurant.id).eq('business_date', kstDate(-1)).maybeSingle(),
    db.from('daily_specs').select('total_amount').eq('restaurant_id', restaurant.id).gte('business_date', `${today.slice(0, 7)}-01`),
    db.from('daily_specs').select('business_date').eq('restaurant_id', restaurant.id).order('business_date', { ascending: false }).limit(3),
    db.from('receivables').select('balance, status').eq('restaurant_id', restaurant.id),
    db.from('inquiries').select('id, title, status, created_at').eq('organization_id', restaurant.organization_id).order('created_at', { ascending: false }).limit(5),
    latestLine ? db.from('supplier_products').select('price_snapshots(sale_price, unit, effective_from)').eq('product_id', latestLine.product_id).eq('status', 'active') : Promise.resolve({ data: [], error: null }),
  ])
  if ([todayResult, yesterdayResult, monthResult, recentResult, balanceResult, inquiryResult, trendResult].some(result => result.error)) {
    return NextResponse.json({ error: '대시보드 조회에 실패했습니다. 다시 시도해주세요.' }, { status: 500 })
  }
  let supplyError: string | null = null
  let supplyRows: Array<{ ours: string[]; name: string; unit: string; recentAvg: number; priorAvg: number; changeRate: number; risk: string }> = []
  try {
    const market = await getSupplyTrend(db, kstDate(-40))
    const names = new Set(market.keys())
    const grouped = new Map<string, typeof supplyRows[number]>()
    for (const line of dashboardLines) {
      const name = productName(line)
      const mapped = toMarketName(name, names)
      const trend = mapped ? market.get(mapped) : null
      if (!mapped || !trend) continue
      const row = grouped.get(mapped) ?? { ...trend, ours: [] }
      if (!row.ours.includes(name)) row.ours.push(name)
      grouped.set(mapped, row)
    }
    const risks = ['critical', 'high', 'watch', 'safe']
    supplyRows = [...grouped.values()].sort((a, b) => risks.indexOf(a.risk) - risks.indexOf(b.risk) || a.changeRate - b.changeRate)
  } catch {
    supplyError = '수급위험 자료를 불러오지 못했습니다. 다시 시도해주세요.'
  }
  const webDashboard = {
    todayStatus: todayResult.data?.status ?? null,
    yesterdayTotal: Number(yesterdayResult.data?.total_amount ?? 0),
    monthTotal: (monthResult.data ?? []).reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0),
    recentDates: (recentResult.data ?? []).map(row => row.business_date),
    outstanding: (balanceResult.data ?? []).filter(row => row.status !== 'paid' && Number(row.balance) > 0).reduce((sum, row) => sum + Number(row.balance), 0),
    inquiries: inquiryResult.data ?? [],
    trend: buildDashboardTrend(specs, dashboardLines, (trendResult.data ?? []).flatMap(row => row.price_snapshots ?? []), recentRangeStart, today),
    supplyRows, supplyError,
    insight: insightResult.data ?? null,
  }
  return NextResponse.json({
    webDashboard,
    prices,
    weeklyItems,
    weeklyTotal: specs.reduce((sum, spec) => sum + Number(spec.total_amount ?? 0), 0),
    weeklyOrderDays: new Set(specs.map((spec) => spec.business_date)).size,
    insight: insightResult.data?.insight_text ?? null,
    insightMeta: insightResult.data ?? null,
    weekStart,
    recentRangeStart,
    today,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
