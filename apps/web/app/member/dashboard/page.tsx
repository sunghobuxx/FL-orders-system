export const runtime = 'edge'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function MemberDashboardPage() {
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships')
    .select('organizations(id, name)')
    .eq('user_id', user.id)
    .single()

  const orgData = membership?.organizations
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string; name: string } | undefined

  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const today = now.toISOString().split('T')[0]
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const monthStart = `${today.slice(0, 7)}-01`

  const recentRangeStart = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const fmt = (n: number) => `${n.toLocaleString('ko-KR')}원`

  if (!org) {
    return (
      <div className="flex min-h-[calc(100vh-56px)]">
        <aside className="hidden md:block w-40 shrink-0 border-r border-gray-200 bg-white" />
        <div className="flex-1 p-4 md:p-6">
          <p className="text-gray-400 text-sm">업체 정보가 없습니다.</p>
        </div>
      </div>
    )
  }

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id')
    .eq('organization_id', org.id)
    .single()

  if (!restaurant) {
    return (
      <div className="flex min-h-[calc(100vh-56px)]">
        <aside className="hidden md:block w-40 shrink-0 border-r border-gray-200 bg-white" />
        <div className="flex-1 p-4 md:p-6">
          <p className="text-gray-400 text-sm">식당 정보가 없습니다.</p>
        </div>
      </div>
    )
  }

  const [
    todayBatchRes,
    yesterdaySpecRes,
    monthSpecsRes,
    recentSpecsRes,
    receivablesRes,
    weekSpecsRes,
    noticesRes,
    inquiriesRes,
    weeklyInsightRes,
  ] = await Promise.all([
    supabase
      .from('order_batches')
      .select('id, status')
      .eq('restaurant_id', restaurant.id)
      .eq('business_date', today)
      .maybeSingle(),
    supabase
      .from('daily_specs')
      .select('total_amount')
      .eq('restaurant_id', restaurant.id)
      .eq('business_date', yesterday)
      .maybeSingle(),
    supabase
      .from('daily_specs')
      .select('business_date, total_amount')
      .eq('restaurant_id', restaurant.id)
      .gte('business_date', monthStart)
      .order('business_date', { ascending: false }),
    supabase
      .from('daily_specs')
      .select('business_date')
      .eq('restaurant_id', restaurant.id)
      .order('business_date', { ascending: false })
      .limit(3),
    supabase
      .from('receivables')
      .select('balance, status')
      .eq('restaurant_id', restaurant.id),
    supabase
      .from('daily_specs')
      .select('id, business_date, total_amount')
      .eq('restaurant_id', restaurant.id)
      .gte('business_date', recentRangeStart)
      .lte('business_date', today)
      .order('business_date', { ascending: true }),
    supabase
      .from('notices')
      .select('id, title, created_at')
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('inquiries')
      .select('id, title, status, created_at')
      .eq('organization_id', org.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('weekly_insights')
      .select('insight_text, data_summary, model, created_at, week_start')
      .eq('restaurant_id', restaurant.id)
      .order('week_start', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const todayBatch = todayBatchRes.data
  const todayOrdered = !!todayBatch
  const todayStatus = todayBatch?.status ?? null

  const yesterdayTotal = Number(yesterdaySpecRes.data?.total_amount ?? 0)

  const monthSpecs = monthSpecsRes.data ?? []
  const monthTotal = monthSpecs.reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
  const recentDates = (recentSpecsRes.data ?? []).map(r => r.business_date)

  const totalOutstanding = (receivablesRes.data ?? [])
    .filter(r => r.status !== 'paid' && Number(r.balance) > 0)
    .reduce((s, r) => s + Number(r.balance), 0)

  const weekSpecs = weekSpecsRes.data ?? []
  const weekTotal = weekSpecs.reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
  type TrendLine = {
    product_id?: string | null
    product_name?: string | null
    qty: number | null
    unit: string | null
    unit_price: number | null
    amount: number | null
    products?: { standard_name: string | null } | { standard_name: string | null }[] | null
  }
  const specIds = weekSpecs.map((spec: any) => spec.id).filter(Boolean)
  const adminSupabase = createAdminClient()
  const { data: trendLines } = specIds.length > 0
    ? await adminSupabase
        .from('daily_spec_lines')
        .select('daily_spec_id, product_id, qty, unit, unit_price, amount, products(standard_name)')
        .in('daily_spec_id', specIds)
    : { data: [] }
  const linesBySpec = new Map<string, TrendLine[]>()
  for (const rawLine of trendLines ?? []) {
    const line = rawLine as unknown as TrendLine & { daily_spec_id: string }
    const rows = linesBySpec.get(line.daily_spec_id) ?? []
    rows.push(line)
    linesBySpec.set(line.daily_spec_id, rows)
  }
  type TrendPoint = {
    date: string
    total: number
    line: TrendLine | null
  }
  const trendPoints: TrendPoint[] = weekSpecs.map((spec: any) => {
    const lines = linesBySpec.get(spec.id) ?? []
    const line = [...lines].sort((a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0))[0] ?? null
    return {
      date: spec.business_date,
      total: Number(spec.total_amount ?? 0),
      line,
    }
  })
  const latestTrend = [...trendPoints].reverse().find(p => p.line) ?? trendPoints.at(-1)
  const latestLine = latestTrend?.line ?? null
  const latestProduct = Array.isArray(latestLine?.products) ? latestLine?.products[0] : latestLine?.products
  const latestProductName = latestLine?.product_name ?? latestProduct?.standard_name ?? null
  const latestProductId = latestLine?.product_id ?? null
  const latestUnitPrice = Number(latestLine?.unit_price ?? latestTrend?.total ?? 0)
  const trendValues = trendPoints.map(p => Number(p.line?.unit_price ?? p.total ?? 0)).filter(v => v > 0)

  const { data: supplierProductsForTrend } = latestProductId
    ? await adminSupabase
        .from('supplier_products')
        .select('id, product_id, price_snapshots(sale_price, unit, effective_from)')
        .eq('product_id', latestProductId)
        .eq('status', 'active')
    : { data: [] }

  type Snapshot = { sale_price: number; unit?: string | null; effective_from: string }
  const snapshots = (supplierProductsForTrend ?? [])
    .flatMap((sp: any) => (sp.price_snapshots ?? []) as Snapshot[])
    .filter(s => s.effective_from <= today)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from))

  const dateList: string[] = []
  for (let t = new Date(`${recentRangeStart}T00:00:00Z`).getTime(); t <= new Date(`${today}T00:00:00Z`).getTime(); t += 24 * 60 * 60 * 1000) {
    dateList.push(new Date(t).toISOString().slice(0, 10))
  }

  const chartPoints = dateList.map(date => {
    const snap = [...snapshots].reverse().find(s => s.effective_from <= date)
    const fallback = trendPoints.find(p => p.date === date)
    return {
      date,
      value: Number(snap?.sale_price ?? fallback?.line?.unit_price ?? fallback?.total ?? latestUnitPrice ?? 0),
      unit: snap?.unit ?? latestLine?.unit ?? '',
    }
  }).filter(point => point.value > 0)

  const chartValues = chartPoints.map(p => p.value)
  const maxTrendValue = Math.max(...chartValues, ...trendValues, 1)
  const minTrendValue = Math.min(...chartValues, ...trendValues, maxTrendValue)
  const paddedMin = Math.max(0, Math.floor((minTrendValue * 0.85) / 1000) * 1000)
  const paddedMax = Math.ceil((maxTrendValue * 1.1) / 1000) * 1000
  const yTicks = Array.from({ length: 5 }, (_, idx) => Math.round(paddedMax - ((paddedMax - paddedMin) / 4) * idx))
  const chartWidth = 620
  const chartHeight = 190
  const plotLeft = 64
  const plotRight = 34
  const plotTop = 24
  const plotBottom = 42
  const plotWidth = chartWidth - plotLeft - plotRight
  const plotHeight = chartHeight - plotTop - plotBottom
  const valueRange = Math.max(1, paddedMax - paddedMin)
  const toX = (idx: number) => plotLeft + (chartPoints.length <= 1 ? plotWidth : (plotWidth * idx) / (chartPoints.length - 1))
  const toY = (value: number) => plotTop + plotHeight - ((value - paddedMin) / valueRange) * plotHeight
  const linePath = chartPoints.map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(idx).toFixed(1)} ${toY(point.value).toFixed(1)}`).join(' ')
  const miniWidth = 190
  const miniHeight = 56
  const miniPath = chartPoints.map((point, idx) => {
    const x = chartPoints.length <= 1 ? miniWidth - 8 : 8 + ((miniWidth - 16) * idx) / (chartPoints.length - 1)
    const y = 8 + (miniHeight - 16) - ((point.value - paddedMin) / valueRange) * (miniHeight - 16)
    return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')

  const chartLast = chartPoints.at(-1)
  const chartFirst = chartPoints[0]
  const currentUnitPrice = Number(chartLast?.value ?? latestUnitPrice ?? 0)
  const trendDelta = chartFirst && chartFirst.value > 0
    ? ((currentUnitPrice - chartFirst.value) / chartFirst.value) * 100
    : 0
  const trendRangeLabel = `${recentRangeStart} ~ ${today}`
  const formatShortDate = (date: string) => {
    const [, m, d] = date.split('-')
    return `${Number(m)}/${Number(d)}`
  }
  const formatK = (n: number) => `${Math.round(n / 1000)}k`
  const latestProductLines = (trendLines ?? [])
    .map(line => line as unknown as TrendLine & { daily_spec_id: string })
    .filter(line => {
      const product = Array.isArray(line.products) ? line.products[0] : line.products
      return (latestProductId && line.product_id === latestProductId) || product?.standard_name === latestProductName
    })
  const weeklyQty = latestProductLines.reduce((sum, line) => sum + Number(line.qty ?? 0), 0)
  const weeklyProductCost = latestProductLines.reduce((sum, line) => sum + Number(line.amount ?? 0), 0) || currentUnitPrice * (weeklyQty || 1)
  const orderedDates = new Set(latestProductLines.map(line => line.daily_spec_id))
  const orderDays = Math.max(1, orderedDates.size || weekSpecs.length || 1)
  const averageQty = weeklyQty / orderDays
  const unitLabel = latestLine?.unit ?? chartLast?.unit ?? ''
  const qtyText = (qty: number) => `${Number.isInteger(qty) ? qty : Number(qty.toFixed(1))}${unitLabel}`

  const notices = noticesRes.data ?? []
  const inquiries = inquiriesRes.data ?? []
  const weeklyInsight = weeklyInsightRes.data as {
    insight_text: string | null
    data_summary: { weeks?: number; products?: string[]; dataRange?: string } | null
    model: string | null
    created_at: string | null
    week_start: string | null
  } | null
  const insightLines = (weeklyInsight?.insight_text ?? '').split('\n').filter(Boolean)
  const insightProductsCount = weeklyInsight?.data_summary?.products?.length ?? 0
  const insightWeeks = weeklyInsight?.data_summary?.weeks ?? null
  const insightCreatedAt = weeklyInsight?.created_at
    ? new Date(weeklyInsight.created_at).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).replace(/\\. /g, '. ').replace(/:$/, '')
    : null
  const insightModelLabel = weeklyInsight?.model?.startsWith('gemini:')
    ? 'Gemini 분석'
    : 'AI 분석'

  const INQUIRY_STATUS: Record<string, { label: string; cls: string }> = {
    pending: { label: '대기중', cls: 'bg-yellow-100 text-yellow-700' },
    answered: { label: '답변완료', cls: 'bg-green-100 text-green-700' },
    resolved: { label: '답변완료', cls: 'bg-green-100 text-green-700' },
  }

  return (
    <div className="flex min-h-[calc(100vh-56px)]">
      <aside className="hidden md:block w-40 shrink-0 border-r border-gray-200 bg-white" />
      <div className="flex-1 p-4 md:p-6 space-y-4 md:space-y-5 w-full md:max-w-3xl">

        {/* 금일 / 전일 발주 내역 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 font-medium mb-2 whitespace-nowrap">금일 발주 내역</p>
            {todayOrdered ? (
              <p className="text-lg font-bold text-gray-800">
                {todayStatus === 'submitted' ? '발주완료' : todayStatus === 'confirmed' ? '확정됨' : '진행중'}
              </p>
            ) : (
              <>
                <p className="text-lg font-bold text-gray-400">미발주</p>
                <Link
                  href="/member/order"
                  className="mt-2 inline-block text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap"
                >
                  발주하기
                </Link>
              </>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 font-medium mb-2 whitespace-nowrap">전일 발주 내역</p>
            <p className="text-xl font-bold text-gray-700 leading-tight">{fmt(yesterdayTotal)}</p>
          </div>
        </div>

        {/* 이번 달 납품 현황 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">이번 달 납품 현황</h2>
            <Link href="/member/settlement/history" className="text-xs text-brand-600 hover:text-brand-800">전체 내역 →</Link>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">납품 합계</p>
                <p className="text-lg font-bold text-gray-900">{fmt(monthTotal)}</p>
              </div>
              <div className={`rounded-lg p-3 ${totalOutstanding > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                <p className="text-xs text-gray-400 mb-1">미수금</p>
                <p className={`text-lg font-bold ${totalOutstanding > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {fmt(totalOutstanding)}
                </p>
              </div>
            </div>
            {recentDates.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-1.5">최근 납품일</p>
                <div className="flex gap-2 flex-wrap">
                  {recentDates.map(d => (
                    <Link
                      key={d}
                      href={`/member/spec?date=${d}`}
                      className="text-xs bg-gray-100 text-brand-600 px-3 py-1 rounded-lg hover:bg-gray-200 font-medium"
                    >
                      {d}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 미결제 */}
        {totalOutstanding > 0 && (
          <div className="rounded-xl border bg-red-50 border-red-200 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium mb-1 text-gray-500">미결제</p>
              <p className="text-2xl font-bold text-red-600">{fmt(totalOutstanding)}</p>
            </div>
            <Link
              href="/member/settlement"
              className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700 whitespace-nowrap"
            >
              결제하기
            </Link>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">납품 단가 2주 추이</h2>
            <span className="text-xs text-gray-400">{trendRangeLabel}</span>
          </div>
          <div className="p-4">
            {chartPoints.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">최근 2주 단가 데이터가 없습니다</div>
            ) : (
              <>
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto" role="img" aria-label="납품 단가 2주 추이">
                  {yTicks.map(tick => {
                    const y = toY(tick)
                    return (
                      <g key={tick}>
                        <line x1={plotLeft} x2={chartWidth - plotRight} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                        <text x={plotLeft - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#9ca3af">{formatK(tick)}</text>
                      </g>
                    )
                  })}
                  {chartPoints.map((point, idx) => (
                    (idx % 3 === 0 || idx === chartPoints.length - 1) && (
                      <text key={point.date} x={toX(idx)} y={chartHeight - 14} textAnchor="middle" fontSize="11" fill="#9ca3af">
                        {formatShortDate(point.date)}
                      </text>
                    )
                  ))}
                  <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
                  {chartLast && (
                    <>
                      <circle cx={toX(chartPoints.length - 1)} cy={toY(chartLast.value)} r="3.5" fill="#2563eb" />
                      <text x={toX(chartPoints.length - 1) - 2} y={toY(chartLast.value) - 8} textAnchor="end" fontSize="11" fontWeight="700" fill="#2563eb">
                        {fmt(chartLast.value)}
                      </text>
                    </>
                  )}
                </svg>
                <div className="mt-1 flex items-center gap-2 text-xs text-gray-700">
                  <span className="inline-block h-0.5 w-10 bg-blue-600" />
                  <span>{latestProductName ?? '최근 납품'}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700">현재 납품 단가</h2>
          </div>
          <div className="px-4 py-3">
            <div className="grid grid-cols-[64px_1fr_auto] items-center gap-3 text-sm">
              <span className="text-gray-600">{latestProductName ?? '최근 납품'}</span>
              <div className="h-4 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-gray-200" style={{ width: '88%' }} />
              </div>
              <span className="font-bold text-gray-800">{fmt(currentUnitPrice)}/{unitLabel || 'unit'}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">이번 주 납품 분석</h2>
            <span className="text-xs text-gray-400">월~토</span>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-gray-50 p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">발주일</p>
                <p className="text-lg font-bold text-gray-900">{weekSpecs.length}일</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">주간 비용</p>
                <p className="text-lg font-bold text-gray-900">{fmt(weeklyProductCost)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">일평균</p>
                <p className="text-lg font-bold text-gray-900">{fmt(Math.round(weeklyProductCost / Math.max(1, orderDays)))}</p>
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-600" />
                  <span className="text-sm font-bold text-gray-800">{latestProductName ?? '최근 납품'}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-800">{fmt(currentUnitPrice)}/{unitLabel || 'unit'}</p>
                  <p className={`text-xs font-semibold ${trendDelta >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                    {trendDelta >= 0 ? '▲' : '▼'} {Math.abs(trendDelta).toFixed(1)}%
                  </p>
                </div>
              </div>
              <svg viewBox={`0 0 ${miniWidth} ${miniHeight}`} className="h-16 w-full" aria-label="단가 추이 차트">
                <defs>
                  <linearGradient id="dashboardMiniTrend" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {miniPath && (
                  <>
                    <path d={`${miniPath} L ${miniWidth - 8} ${miniHeight - 6} L 8 ${miniHeight - 6} Z`} fill="url(#dashboardMiniTrend)" />
                    <path d={miniPath} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    {chartLast && <circle cx={miniWidth - 8} cy={8 + (miniHeight - 16) - ((chartLast.value - paddedMin) / valueRange) * (miniHeight - 16)} r="3" fill="#ef4444" />}
                  </>
                )}
              </svg>
              <div className="mt-3 grid grid-cols-3 text-center">
                <div>
                  <p className="text-xs text-gray-400">주간 발주량</p>
                  <p className="text-sm font-semibold text-gray-700">{qtyText(weeklyQty || 1)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">일평균</p>
                  <p className="text-sm font-semibold text-gray-700">{qtyText(averageQty || 1)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">주간 비용</p>
                  <p className="text-sm font-semibold text-gray-700">{fmt(weeklyProductCost)}</p>
                </div>
              </div>
            </div>
            <p className="text-right text-xs text-gray-300">최근 7일 ({recentRangeStart} ~ {today}) · 차트: 2주간 단가 추이</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">수급위험 예측 · 구매 어드바이스</h2>
            <span className="text-xs text-gray-400">가락시장 출하물량 예측</span>
          </div>
          <div className="p-4 space-y-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-sm font-semibold text-gray-700 mb-1">이번 주 수급위험 브리핑</p>
              <p className="text-sm text-gray-500">
                주문 품목 중 가락시장 출하 예측 데이터가 있는 품목이 없습니다.
              </p>
              <p className="mt-2 text-xs text-gray-400">API 반환 품목 수: 0개</p>
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">✨ 구매 운영 어드바이스</span>
                <span className="text-xs text-gray-300">{insightModelLabel}</span>
              </div>
              {insightLines.length > 0 ? (
                <div className="space-y-3 text-sm leading-7 text-gray-900">
                  {insightLines.map((line, idx) => (
                    <p key={`${line}-${idx}`} className="break-keep">{line}</p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">AI 분석 데이터를 불러오는 중입니다.</p>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-300">
              <span>방금 생성됨 · {insightModelLabel}은 참고용입니다</span>
              <span>
                {insightCreatedAt ?? ''}
                {insightWeeks && insightProductsCount > 0
                  ? ` · ${insightWeeks}주 · 품목 ${insightProductsCount}개`
                  : ''}
              </span>
            </div>
          </div>
        </div>

        {/* 공지사항 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">공지사항</h2>
            <Link href="/member/notices" className="text-xs text-brand-600 hover:text-brand-800">전체보기 →</Link>
          </div>
          {notices.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-400 text-center">공지사항이 없습니다</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notices.map(n => (
                <Link
                  key={n.id}
                  href={`/member/notices/${n.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm text-gray-800 truncate flex-1 mr-3">{n.title}</span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(n.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' }).replace(/\. $/, '')}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* 불편 & 문의 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">불편 &amp; 문의</h2>
            <Link
              href="/member/inquiries/new"
              className="text-xs bg-brand-600 text-white px-3 py-1 rounded-lg font-semibold hover:bg-brand-700"
            >
              글쓰기
            </Link>
          </div>
          {inquiries.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-400 text-center">문의 내역이 없습니다</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {inquiries.map(inq => {
                const st = INQUIRY_STATUS[inq.status] ?? { label: inq.status, cls: 'bg-gray-100 text-gray-600' }
                return (
                  <Link
                    key={inq.id}
                    href={`/member/inquiries/${inq.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-sm text-gray-800 truncate flex-1 mr-3">{inq.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${st.cls}`}>
                      {st.label}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
