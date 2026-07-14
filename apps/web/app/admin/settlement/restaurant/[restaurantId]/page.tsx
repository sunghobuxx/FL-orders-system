export const runtime = 'edge'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminSettlementShell from '../../AdminSettlementShell'
import { PayButton } from '@/app/member/spec/SpecActions'

interface Props {
  params: Promise<{ restaurantId: string }>
}

function getPeriodLabel(period: { period_type: string; start_date: string } | null): string {
  if (!period) return '-'
  const [, monthStr, dayStr] = period.start_date.split('-')
  const month = Number(monthStr)
  const week = Math.ceil(Number(dayStr) / 7)
  return period.period_type === 'weekly'
    ? `${month}월 ${week}주/${month}월`
    : `${month}월`
}

export default async function AdminSettlementRestaurantPage({ params }: Props) {
  const { restaurantId } = await params
  const db = createAdminClient()

  const { data: restaurant } = await db
    .from('restaurants')
    .select('id, organizations(name)')
    .eq('id', restaurantId)
    .single()

  if (!restaurant) notFound()

  const orgRaw = restaurant.organizations as unknown as { name: string } | null
  const restaurantName = orgRaw?.name ?? '알 수 없음'

  const { data: statements } = await db
    .from('sales_statements')
    .select('id, total_amount, outstanding_amount, settlement_periods(period_type, start_date, end_date, status)')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(20)

  type Period = { period_type: string; start_date: string; end_date: string; status: string }
  type Stmt = {
    id: string
    total_amount: number | null
    outstanding_amount: number | null
    settlement_periods: Period | null
  }

  const stmts = (statements ?? []) as unknown as Stmt[]
  const totalOutstanding = stmts.reduce((s, st) => s + Number(st.outstanding_amount ?? 0), 0)

  const todayStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const fmt = (n: number) => `${n.toLocaleString('ko-KR')}원`

  return (
    <AdminSettlementShell>
      <div className="space-y-4 max-w-3xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">업체명:</span>
            <span className="bg-gray-100 px-4 py-1.5 rounded font-semibold text-gray-800">{restaurantName}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">날짜:</span>
            <span className="bg-gray-100 px-4 py-1.5 rounded text-gray-400">{todayStr} (당일)</span>
          </div>
        </div>

        {/* 정산 목록 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {stmts.map(stmt => {
              const period = stmt.settlement_periods
              const outstanding = Number(stmt.outstanding_amount ?? 0)
              const total = Number(stmt.total_amount ?? 0)
              const isInProgress = period?.status === 'open' && outstanding === 0 && total > 0
              const label = getPeriodLabel(period)

              return (
                <div key={stmt.id} className="flex items-center justify-between px-5 py-4">
                  <Link
                    href={`/admin/settlement/restaurant/${restaurantId}/${stmt.id}`}
                    className="flex-1 text-sm text-brand-600 bg-gray-100 px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors mr-4"
                  >
                    {label}
                  </Link>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">총금액:</p>
                      <p className="text-sm font-semibold text-gray-800 bg-gray-100 px-3 py-1 rounded min-w-24 text-right">
                        {fmt(total)}
                      </p>
                    </div>
                    {isInProgress ? (
                      <span className="w-16 text-center text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-1.5 rounded">
                        진행중
                      </span>
                    ) : (
                      <PayButton disabled={outstanding === 0 && !isInProgress} amount={outstanding} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 총미수금액 */}
          <div className="flex items-center justify-between px-5 py-4 bg-gray-50 border-t border-gray-200">
            <span className="text-sm font-semibold text-gray-700">총미수금액:</span>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-bold px-4 py-1.5 rounded min-w-28 text-right ${totalOutstanding > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-800'}`}>
                {fmt(totalOutstanding)}
              </span>
              <PayButton disabled={totalOutstanding === 0} amount={totalOutstanding} />
            </div>
          </div>
        </div>
      </div>
    </AdminSettlementShell>
  )
}
