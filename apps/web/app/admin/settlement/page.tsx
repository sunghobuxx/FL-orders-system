export const runtime = 'edge'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminSettlementShell from './AdminSettlementShell'
import { CalcButton, CloseButton, PeriodForm } from './history/SettlementActions'

const PERIOD_LABEL: Record<string, string> = { weekly: '주', monthly: '월' }
const PERIOD_COLOR: Record<string, string> = {
  weekly: 'bg-purple-100 text-purple-700',
  monthly: 'bg-blue-100 text-blue-700',
}

export default async function AdminSettlementPage() {
  const db = createAdminClient()

  const [{ data: periods }, { data: restaurants }, { data: statements }] = await Promise.all([
    db.from('settlement_periods')
      .select('id, period_type, start_date, end_date, status')
      .order('start_date', { ascending: false })
      .limit(30),
    db.from('restaurants')
      .select('id, organization_id, settlement_cycle, organizations(name)')
      .eq('status', 'active'),
    db.from('sales_statements')
      .select('restaurant_id, total_amount, outstanding_amount'),
  ])

  type Period = { id: string; period_type: string; start_date: string; end_date: string; status: string | null }
  type Restaurant = { id: string; organization_id: string; settlement_cycle: string | null; organizations: { name: string } | null }
  type Stmt = { restaurant_id: string; total_amount: number | null; outstanding_amount: number | null }

  const periodRows = (periods ?? []) as unknown as Period[]
  const restaurantRows = (restaurants ?? []) as unknown as Restaurant[]
  const stmtRows = (statements ?? []) as unknown as Stmt[]

  // 식당별 정산 합산
  const stmtMap: Record<string, { total: number; outstanding: number }> = {}
  for (const s of stmtRows) {
    const existing = stmtMap[s.restaurant_id] ?? { total: 0, outstanding: 0 }
    existing.total += Number(s.total_amount ?? 0)
    existing.outstanding += Number(s.outstanding_amount ?? 0)
    stmtMap[s.restaurant_id] = existing
  }

  const fmt = (n: number) => `${n.toLocaleString('ko-KR')}원`

  return (
    <AdminSettlementShell>
      <div className="space-y-4 max-w-3xl">
        {/* 정산 기간 / 정산 계산 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <span className="text-sm font-semibold text-gray-700">정산 기간 / 정산 계산</span>
          </div>
          <div className="px-5 py-4 border-b border-gray-100">
            <PeriodForm />
          </div>

          {periodRows.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">정산 기간이 없습니다.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {periodRows.map(period => (
                <div key={period.id} className="flex items-center justify-between px-5 py-3 gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${PERIOD_COLOR[period.period_type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {PERIOD_LABEL[period.period_type] ?? period.period_type}
                    </span>
                    <span className="text-sm text-gray-700">{period.start_date} ~ {period.end_date}</span>
                    {period.status === 'closed' && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">마감</span>
                    )}
                  </div>
                  {period.status !== 'closed' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <CalcButton periodId={period.id} />
                      <CloseButton periodId={period.id} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 업체별 정산 현황 */}
        {restaurantRows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-sm text-gray-400">
            등록된 업체가 없습니다
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
              <span>업체명:</span>
              <span className="text-center">정산주기:</span>
              <span className="text-right">총 정산금액:</span>
            </div>
            <div className="divide-y divide-gray-100">
              {restaurantRows.map(rest => {
                const orgName = (rest.organizations as unknown as { name: string } | null)?.name ?? '알 수 없음'
                const cycle = rest.settlement_cycle ?? ''
                const cycleLabel = PERIOD_LABEL[cycle] ?? cycle ?? '-'
                const totals = stmtMap[rest.id] ?? { total: 0, outstanding: 0 }
                return (
                  <div key={rest.id} className="grid grid-cols-[1fr_1fr_1fr] gap-3 items-center px-5 py-3">
                    <Link
                      href={`/admin/settlement/restaurant/${rest.id}`}
                      className="text-sm text-brand-600 bg-gray-100 px-3 py-1.5 rounded font-medium hover:bg-gray-200 transition-colors"
                    >
                      {orgName}
                    </Link>
                    <span className="text-sm text-center text-blue-700 bg-blue-50 px-3 py-1.5 rounded font-semibold">
                      {cycleLabel}
                    </span>
                    <span className="text-sm text-right font-semibold text-gray-800 bg-gray-100 px-3 py-1.5 rounded">
                      {fmt(totals.total)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </AdminSettlementShell>
  )
}
