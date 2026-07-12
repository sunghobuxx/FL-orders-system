export const runtime = 'edge'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

async function getTotalPurchase(db: ReturnType<typeof createAdminClient>, from: string, to: string): Promise<number> {
  const { data: batches } = await db
    .from('order_batches')
    .select('id')
    .gte('business_date', from)
    .lte('business_date', to)
    .in('status', ['submitted', 'validated', 'ordered', 'dispatched', 'completed'])
  const batchIds = (batches ?? []).map(b => b.id)
  if (batchIds.length === 0) return 0

  const { data: items } = await db
    .from('order_items')
    .select('product_id, qty, unit_price_snapshot, products(is_fixed_price), orders!inner(batch_id)')
    .in('orders.batch_id', batchIds)

  const allItems = items ?? []
  const productIds = [...new Set(allItems.map(i => i.product_id))]
  const productToSupplier = new Map<string, string>()
  if (productIds.length > 0) {
    const { data: spRows } = await db
      .from('supplier_products')
      .select('product_id, supplier_id, updated_at')
      .in('product_id', productIds)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
    for (const sp of spRows ?? []) {
      if (!productToSupplier.has(sp.product_id)) productToSupplier.set(sp.product_id, sp.supplier_id)
    }
  }

  let total = 0
  for (const item of allItems) {
    if (item.products && productToSupplier.has(item.product_id)) {
      total += Number(item.qty) * Number(item.unit_price_snapshot)
    }
  }
  return total
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
    { data: dailySpecsRaw },
    totalPurchase,
    { data: prevSpecsRaw },
    prevPurchase,
    { data: receivablesRaw },
    { data: payablesRaw },
  ] = await Promise.all([
    db.from('daily_specs')
      .select('id, business_date, total_amount, restaurants(organizations(name))')
      .gte('business_date', from)
      .lte('business_date', to),
    getTotalPurchase(db, from, to),
    db.from('daily_specs')
      .select('total_amount')
      .gte('business_date', prevFrom)
      .lte('business_date', prevTo),
    getTotalPurchase(db, prevFrom, prevTo),
    db.from('receivables').select('balance').in('status', ['unpaid', 'partial', 'overdue']),
    db.from('payables' as 'receivables').select('balance').in('status', ['unpaid', 'partial', 'overdue']),
  ])

  const dailySpecs = dailySpecsRaw ?? []
  const dailyAmountMap = new Map<string, number>()
  for (const spec of dailySpecs) {
    const amount = Number(spec.total_amount) || 0
    dailyAmountMap.set(spec.business_date, (dailyAmountMap.get(spec.business_date) ?? 0) + amount)
  }

  const totalSales = [...dailyAmountMap.values()].reduce((s, a) => s + a, 0)
  const prevTotalSales = (prevSpecsRaw ?? []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0)
  const totalReceivable = (receivablesRaw ?? []).reduce((s, r) => s + (Number(r.balance) || 0), 0)
  const totalPayable = (payablesRaw ?? []).reduce((s, r) => s + (Number(r.balance) || 0), 0)
  const daysWithSales = [...dailyAmountMap.values()].filter(a => a > 0).length
  const avgDailySales = daysWithSales > 0 ? Math.round(totalSales / daysWithSales) : 0
  const netProfit = totalSales - totalPurchase
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

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">총매출</p>
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
