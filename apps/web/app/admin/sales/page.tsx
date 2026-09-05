export const runtime = 'edge'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { buildPurchaseCostResolver } from '@/lib/pricing/purchase-cost'
import MarketPriceSection from './MarketPriceSection'
import AdminSettlementShell from '@/app/admin/settlement/AdminSettlementShell'
import { getKstToday } from '@/lib/date-kst'

function getMonthBounds(month: string) {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { startDate: `${month}-01`, endDate: `${month}-${String(lastDay).padStart(2, '0')}` }
}

function pctChange(current: number, prev: number): number | null {
  if (prev === 0) return null
  return Math.round((current - prev) / prev * 1000) / 10
}

function getPriorMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function getNextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** 총매입과 함께 "이 숫자를 믿어도 되는지" 판단할 근거를 돌려준다. */
interface PurchaseStat {
  /** 매입가가 등록된 품목만 더한 값. 순이익은 이걸로 낸다. */
  total: number
  /** 위 total 에 대응하는 매출 — 같은 명세줄의 청구액 */
  matchedSales: number
  /** 매입가가 없어 매입을 계산하지 못한 품목 수 */
  missingCostCount: number
  /** 그 품목들의 청구액. 순이익 계산에서 매출·매입 양쪽 모두 빠진다. */
  missingCostSales: number
}

async function getTotalPurchase(db: ReturnType<typeof createAdminClient>, from: string, to: string): Promise<PurchaseStat> {
  // 매입도 **명세서 기준**으로 낸다.
  //
  // 예전에는 매출은 명세서에서, 매입은 발주에서 계산했다. 둘이 같은 물건을 가리키지
  // 않으면 순이익이 통째로 흔들린다 — 2026-08 에 발주를 판매가로 합치면 48,784,260 인데
  // 명세서 매출은 46,773,230 이라 2,011,030 이 어긋나 있었다. 업체별 고정단가로
  // 명세서만 낮아진 경우(와이로지스 두절콩나물 13,500→1,000)가 대표적이다.
  // 청구한 줄에 대응하는 매입만 세면 그 어긋남이 사라진다.
  //
  // 또 예전에는 그 달 배치 id 를 전부 .in() 에 넣었다. 8월은 배치가 455 개라
  // 요청 주소가 서버 한계(16KB)를 넘어 조회 자체가 실패했다. 명세줄은 날짜로 거르므로
  // id 목록을 실어 보낼 일이 없다.
  const lines = await fetchAll<{
    product_id: string; qty: number; amount: number; unit: string | null
    daily_specs: { business_date: string } | null
  }>(() => db
    .from('daily_spec_lines')
    .select('product_id, qty, amount, unit, daily_specs!inner(business_date)')
    .gte('daily_specs.business_date', from)
    .lte('daily_specs.business_date', to))

  if (!lines.length) {
    return { total: 0, matchedSales: 0, missingCostCount: 0, missingCostSales: 0 }
  }

  const productIds = [...new Set(lines.map(l => l.product_id).filter(Boolean))]
  const costs = await buildPurchaseCostResolver(db, productIds)

  let total = 0
  let matchedSales = 0
  let missingCostCount = 0
  let missingCostSales = 0
  for (const line of lines) {
    const spec = Array.isArray(line.daily_specs) ? line.daily_specs[0] : line.daily_specs
    const date = spec?.business_date
    // 단위까지 맞춘 매입가. kg 로 판 것에 bag 원가가 붙으면 이익이 통째로 틀어진다.
    const cost = date ? costs.costOf(line.product_id, date, line.unit) : null
    const sales = Number(line.amount ?? 0)
    // 매입가가 없으면 판매가로 때우지 않는다. 그러면 그 품목 마진이 0 이 되어
    // 이익이 실제보다 작게 나온다(2026-08: 19건 432,000원). 아예 빼고 몇 건인지 알린다.
    if (cost === null) {
      missingCostCount++
      missingCostSales += sales
      continue
    }
    total += Number(line.qty ?? 0) * cost
    matchedSales += sales
  }
  return { total, matchedSales, missingCostCount, missingCostSales }
}

function buildCalendar(month: string, dailyAmounts: Map<string, number>) {
  const [y, m] = month.split('-').map(Number)
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells: { date: string | null; amount: number }[] = []
  for (let i = 0; i < firstDow; i++) cells.push({ date: null, amount: 0 })
  for (let d = 1; d <= lastDay; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`
    cells.push({ date, amount: dailyAmounts.get(date) ?? 0 })
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, amount: 0 })
  const weeks: typeof cells[] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

interface Props {
  searchParams: Promise<{ month?: string; date?: string }>
}

export default async function AdminSalesPage({ searchParams }: Props) {
  const { month: monthParam, date: selectedDate } = await searchParams
  const { supabase, user } = await getSessionUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (membership?.role !== 'owner') redirect('/admin/dashboard')

  const db = createAdminClient()
  const today = getKstToday()
  const month = monthParam ?? today.slice(0, 7)
  const { startDate: from, endDate: to } = getMonthBounds(month)
  const prevMonth = getPriorMonth(month)
  const { startDate: prevFrom, endDate: prevTo } = getMonthBounds(prevMonth)
  const nextMonth = getNextMonth(month)
  const currentMonth = today.slice(0, 7)

  const [
    dailySpecsRaw,
    purchaseStat,
    prevSpecsRaw,
    prevPurchaseStat,
    receivablesRaw,
    payablesRaw,
  ] = await Promise.all([
    fetchAll(() => db.from('daily_specs')
      .select('id, business_date, total_amount, restaurants(organizations(name))')
      .gte('business_date', from)
      .lte('business_date', to)),
    getTotalPurchase(db, from, to),
    fetchAll<{ total_amount: number }>(() => db.from('daily_specs')
      .select('total_amount')
      .gte('business_date', prevFrom)
      .lte('business_date', prevTo)),
    getTotalPurchase(db, prevFrom, prevTo),
    fetchAll<{ balance: number }>(() => db.from('receivables').select('balance').in('status', ['unpaid', 'partial', 'overdue'])),
    fetchAll<{ balance: number }>(() => db.from('payables' as 'receivables').select('balance').in('status', ['unpaid', 'partial', 'overdue'])),
  ])

  const dailySpecs = dailySpecsRaw
  const dailyAmountMap = new Map<string, number>()
  for (const spec of dailySpecs) {
    const amount = Number(spec.total_amount) || 0
    dailyAmountMap.set(spec.business_date, (dailyAmountMap.get(spec.business_date) ?? 0) + amount)
  }

  const totalSales = [...dailyAmountMap.values()].reduce((s, a) => s + a, 0)
  const prevTotalSales = prevSpecsRaw.reduce((s, r) => s + (Number(r.total_amount) || 0), 0)
  const totalReceivable = receivablesRaw.reduce((s, r) => s + (Number(r.balance) || 0), 0)
  const totalPayable = payablesRaw.reduce((s, r) => s + (Number(r.balance) || 0), 0)
  const daysWithSales = [...dailyAmountMap.values()].filter(a => a > 0).length
  const avgDailySales = daysWithSales > 0 ? Math.round(totalSales / daysWithSales) : 0
  const totalPurchase = purchaseStat.total
  const prevPurchase = prevPurchaseStat.total
  // 순이익은 **매입가를 아는 줄끼리만** 뺀다.
  //
  // 총매출 전체에서 매입을 빼면, 매입가가 없는 품목의 매출이 통째로 이익으로 잡힌다.
  // 짝이 맞는 금액끼리 빼야 마진율이 사실대로 나온다.
  const netProfit = purchaseStat.matchedSales - totalPurchase
  // 매출 중 이익을 낼 수 있는 부분의 비율. 낮으면 매입가 등록이 덜 됐다는 뜻이다.
  const costCoverage = totalSales > 0
    ? Math.round((purchaseStat.matchedSales / totalSales) * 100) : 100
  const salesDelta = pctChange(totalSales, prevTotalSales)
  const purchaseDelta = pctChange(totalPurchase, prevPurchase)

  const calendar = buildCalendar(month, dailyAmountMap)
  const [year, monthNum] = month.split('-').map(Number)
  const fmt = (n: number) => `${Math.round(n).toLocaleString()}원`
  const DOW = ['일', '월', '화', '수', '목', '금', '토']

  type DeltaBadgeProps = { delta: number | null }
  function DeltaBadge({ delta }: DeltaBadgeProps) {
    if (delta === null) return <span className="text-[11px] text-gray-400">전월 데이터 없음</span>
    const up = delta >= 0
    return (
      <span className={`text-[11px] font-semibold ${up ? 'text-red-500' : 'text-blue-500'}`}>
        {up ? '▲' : '▼'} {Math.abs(delta)}%
      </span>
    )
  }

  type SpecRow = { id: string; business_date: string; total_amount: number; restaurants: unknown }
  const selectedDateSpecs = selectedDate
    ? (dailySpecs as unknown as SpecRow[])
        .filter(s => s.business_date === selectedDate)
        .map(s => ({
          specId: s.id,
          name: (s.restaurants as { organizations: { name: string } | null } | null)?.organizations?.name ?? '알 수 없음',
          amount: Number(s.total_amount) || 0,
        }))
        .sort((a, b) => b.amount - a.amount)
    : null
  const selectedDateTotal = selectedDateSpecs?.reduce((s, r) => s + r.amount, 0) ?? 0

  return (
    <AdminSettlementShell>
      <div className="space-y-4 max-w-3xl">
        {/* Month nav */}
        <div className="flex items-center gap-2">
          <Link href={`/admin/sales?month=${prevMonth}`} className="px-2 py-1 text-gray-500 hover:text-gray-800 text-sm border border-gray-200 rounded-lg">‹</Link>
          <span className="bg-gray-100 px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-700">
            {year}년 {monthNum}월
          </span>
          <Link href={`/admin/sales?month=${nextMonth}`} className="px-2 py-1 text-gray-500 hover:text-gray-800 text-sm border border-gray-200 rounded-lg">›</Link>
          {month !== currentMonth && (
            <Link href="/admin/sales" className="text-xs text-brand-600 hover:underline ml-1">이번달</Link>
          )}
        </div>

        {/* 숫자를 믿어도 되는지 알려 준다.
            매입은 발주에서 계산하므로 발주 기록이 빠진 달은 이익이 부풀려 보인다. */}
        {purchaseStat.missingCostCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
            <p className="text-xs text-amber-800">
              <span className="font-semibold">
                매입가가 없는 품목 {purchaseStat.missingCostCount}건({fmt(purchaseStat.missingCostSales)})은
                순이익 계산에서 뺐습니다.
              </span>{' '}
              총매출의 {100 - costCoverage}% 입니다. 품목마스터에 매입가를 넣으면 이익에 반영됩니다.
            </p>
            <p className="text-xs text-amber-700">
              순이익은 <span className="font-semibold">공급가(부가세 제외)</span> 기준입니다.
              부가세는 받아서 국가에 내는 돈이라 이익에 넣지 않습니다 — 총매출 카드와 금액이 다른 이유입니다.
            </p>
          </div>
        )}

        {/* 시세 추이 — 우리 단가와 가락시장 평균 비교 */}
        <MarketPriceSection />

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">총매출 <span className="text-gray-400">(부가세 포함)</span></p>
            <p className="text-lg font-bold text-gray-900">{fmt(totalSales)}</p>
            <DeltaBadge delta={salesDelta} />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">총매입</p>
            <p className="text-lg font-bold text-gray-900">{fmt(totalPurchase)}</p>
            <DeltaBadge delta={purchaseDelta} />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">순이익</p>
            <p className={`text-lg font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(netProfit)}</p>
            {/* 어떤 매출에서 뺀 이익인지 밝힌다.
                총매출과 다른 이유는 둘이다 — 부가세를 뺐고(국가에 낼 돈이라 이익이 아니다),
                매입가를 모르는 품목을 제외했다. */}
            <span className="text-[11px] text-gray-400">
              마진 {purchaseStat.matchedSales > 0
                ? Math.round((netProfit / purchaseStat.matchedSales) * 100) : 0}%
              {' · '}공급가 {fmt(purchaseStat.matchedSales)} 기준
            </span>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">미수금 (받을 돈)</p>
            <p className="text-lg font-bold text-orange-600">{fmt(totalReceivable)}</p>
            <Link href="/admin/finance" className="text-[11px] text-brand-600 hover:underline">미수금 관리 →</Link>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">미지급 (줄 돈)</p>
            <p className="text-lg font-bold text-gray-700">{fmt(totalPayable)}</p>
            <Link href="/admin/purchase" className="text-[11px] text-brand-600 hover:underline">매입 정산 →</Link>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">일평균 매출</p>
            <p className="text-lg font-bold text-gray-900">{fmt(avgDailySales)}</p>
            <span className="text-[11px] text-gray-400">매출 {daysWithSales}일 기준</span>
          </div>
        </div>

        {/* Calendar */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500">
            {DOW.map((d, i) => (
              <div key={d} className={`px-2 py-2 text-center ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : ''}`}>
                {d}
              </div>
            ))}
          </div>
          <div className="divide-y divide-gray-100">
            {calendar.map(week => {
              const firstDate = week.map(c => c.date).find(Boolean)
              return (
                <div key={firstDate ?? 'pad'} className="grid grid-cols-7 divide-x divide-gray-100">
                  {week.map((cell, i) => {
                    if (cell.date === null) {
                      return <div key={`${firstDate}-pad-${DOW[i]}`} className="h-20 bg-gray-50/40" />
                    }
                    const dayNum = Number(cell.date.slice(-2))
                    const isSelected = cell.date === selectedDate
                    return (
                      <Link
                        key={cell.date}
                        href={`/admin/sales?month=${month}&date=${cell.date}`}
                        className={`h-20 p-1.5 flex flex-col transition-colors hover:bg-brand-50 ${
                          isSelected ? 'ring-2 ring-inset ring-brand-500 bg-brand-50' : ''
                        }`}
                      >
                        <span className={`text-xs font-medium ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-600'}`}>
                          {dayNum}
                        </span>
                        {cell.amount > 0 && (
                          <span className="mt-auto text-[11px] font-semibold text-green-700 text-right truncate">
                            {fmt(cell.amount)}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {/* Selected date detail */}
        {selectedDate && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
              <span className="text-sm font-semibold text-gray-700">{selectedDate} 업체별 매출</span>
              <Link href={`/admin/sales?month=${month}`} className="text-xs text-gray-400 hover:text-gray-700">
                닫기 ✕
              </Link>
            </div>
            {selectedDateSpecs && selectedDateSpecs.length > 0 ? (
              <>
                <div className="divide-y divide-gray-100">
                  {selectedDateSpecs.map(spec => (
                    <Link
                      key={spec.specId}
                      href={`/admin/settlement/specs/${spec.specId}`}
                      className="grid grid-cols-[1fr_auto] gap-3 items-center px-5 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-sm text-gray-800">{spec.name}</span>
                      <span className="text-sm font-semibold text-green-700">{fmt(spec.amount)}</span>
                    </Link>
                  ))}
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3 px-5 py-3 bg-gray-50 border-t border-gray-200">
                  <span className="text-sm font-semibold text-gray-600">합계</span>
                  <span className="text-sm font-bold text-gray-900">{fmt(selectedDateTotal)}</span>
                </div>
              </>
            ) : (
              <div className="py-10 text-center text-sm text-gray-400">해당 일자 매출이 없습니다</div>
            )}
          </div>
        )}
      </div>
    </AdminSettlementShell>
  )
}
