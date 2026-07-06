export const runtime = 'edge'

import { createAdminClient } from '@/lib/supabase/admin'

interface Props {
  searchParams: Promise<{ month?: string }>
}

export default async function AdminSalesPage({ searchParams }: Props) {
  const { month: monthParam } = await searchParams
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const currentMonth = monthParam ?? now.toISOString().slice(0, 7)
  const [year, month] = currentMonth.split('-').map(Number)
  const from = `${currentMonth}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${currentMonth}-${String(lastDay).padStart(2, '0')}`

  const db = createAdminClient()

  // 업체별 매출 (sales_statements)
  const { data: statements } = await db
    .from('sales_statements')
    .select('id, organization_id, period_start, period_end, total_amount, outstanding_amount, organizations(name)')
    .gte('period_start', from)
    .lte('period_end', to)
    .order('period_start', { ascending: false })

  type Stmt = {
    id: string
    organization_id: string
    period_start: string
    period_end: string
    total_amount: number
    outstanding_amount: number
    organizations: { name: string } | null
  }
  const stmts = (statements ?? []) as unknown as Stmt[]

  // 일별 매출 집계 (daily_specs)
  const { data: dailySpecs } = await db
    .from('daily_specs')
    .select('business_date, total_amount')
    .gte('business_date', from)
    .lte('business_date', to)

  const totalSales = stmts.reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
  const totalOutstanding = stmts.reduce((s, r) => s + Number(r.outstanding_amount ?? 0), 0)
  const totalPaid = totalSales - totalOutstanding
  const dailyTotal = (dailySpecs ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
  const dailyCount = new Set((dailySpecs ?? []).map(d => d.business_date)).size
  const avgDaily = dailyCount > 0 ? Math.round(dailyTotal / dailyCount) : 0

  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

  const prevMonth = new Date(year, month - 2, 1).toISOString().slice(0, 7)
  const nextMonth = new Date(year, month, 1).toISOString().slice(0, 7)

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* 월 네비게이션 */}
      <div className="flex items-center gap-3">
        <a href={`?month=${prevMonth}`} className="px-3 py-1.5 bg-gray-100 rounded text-gray-500 hover:bg-gray-200 text-sm">←</a>
        <span className="font-bold text-gray-800">{year}년 {month}월</span>
        <a href={`?month=${nextMonth}`} className="px-3 py-1.5 bg-gray-100 rounded text-gray-500 hover:bg-gray-200 text-sm">→</a>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '총매출', value: fmt(totalSales), color: 'text-gray-900' },
          { label: '입금', value: fmt(totalPaid), color: 'text-green-700' },
          { label: '미수금 (받을 돈)', value: fmt(totalOutstanding), color: 'text-red-600' },
          { label: '일평균 매출', value: fmt(avgDaily), color: 'text-gray-700' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3.5">
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className={`text-base font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* 업체별 매출 */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">업체별 매출</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {stmts.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">해당 일자 매출이 없습니다</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
                <span>업체명</span>
                <span className="text-right">총매출</span>
                <span className="text-right">미수금</span>
                <span className="text-right">명세서</span>
              </div>
              <div className="divide-y divide-gray-100">
                {stmts.map(stmt => (
                  <div key={stmt.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-5 py-3">
                    <span className="text-sm text-gray-800">{stmt.organizations?.name ?? '알 수 없음'}</span>
                    <span className="text-sm text-right font-semibold text-gray-700">{fmt(Number(stmt.total_amount ?? 0))}</span>
                    <span className={`text-sm text-right font-semibold ${Number(stmt.outstanding_amount) > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {fmt(Number(stmt.outstanding_amount ?? 0))}
                    </span>
                    <a href={`/admin/settlement/history`} className="text-xs text-brand-600 hover:underline text-right">명세서내역</a>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-5 py-3 bg-gray-50 border-t border-gray-200">
                <span className="text-sm font-bold text-gray-700">합계</span>
                <span className="text-sm text-right font-bold text-gray-800">{fmt(totalSales)}</span>
                <span className="text-sm text-right font-bold text-red-500">{fmt(totalOutstanding)}</span>
                <span />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
