export const runtime = 'edge'

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import SettlementShell from '../SettlementShell'
import { PayButton } from '@/app/member/spec/SpecActions'

export default async function SettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships')
    .select('organizations(id, name)')
    .eq('user_id', user.id)
    .single()

  const orgData = membership?.organizations
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string; name: string } | undefined

  if (!org) return (
    <SettlementShell orgName="" date="">
      <div className="text-gray-400 text-sm text-center py-16">업체 정보가 없습니다.</div>
    </SettlementShell>
  )

  const { data: statement } = await supabase
    .from('sales_statements')
    .select('id, restaurant_id, total_amount, outstanding_amount, settlement_periods(period_type, start_date, end_date, status)')
    .eq('id', id)
    .single()

  if (!statement) notFound()

  const period = statement.settlement_periods as any

  const { data: lines } = await supabase
    .from('sales_statement_lines')
    .select('id, amount, source_doc_type, source_doc_id')
    .eq('sales_statement_id', id)

  const dailySpecIds = (lines ?? [])
    .filter(l => l.source_doc_type === 'daily_spec')
    .map(l => l.source_doc_id)

  let dateMap: Record<string, string> = {}
  if (dailySpecIds.length > 0) {
    const { data: specs } = await supabase
      .from('daily_specs')
      .select('id, business_date')
      .in('id', dailySpecIds)
    dateMap = Object.fromEntries((specs ?? []).map(s => [s.id, s.business_date]))
  }

  const total = Number(statement.total_amount)
  const outstanding = Number(statement.outstanding_amount)
  const fmt = (n: number) => `${n.toLocaleString()}원`

  const { data: otherReceivables } = await supabase
    .from('receivables')
    .select('balance')
    .eq('restaurant_id', statement.restaurant_id)
    .in('status', ['unpaid', 'partial', 'overdue'])
    .neq('statement_id', id)

  const otherOutstanding = (otherReceivables ?? []).reduce((sum, r) => sum + Number(r.balance), 0)
  const totalDue = outstanding + otherOutstanding
  const isPending = period?.status === 'open' && outstanding === 0 && total > 0
  const isPaid = totalDue === 0

  const periodLabel = period
    ? `${period.start_date} ~ ${period.end_date} (${period.period_type === 'weekly' ? '주간' : '월간'})`
    : '정산 상세'

  return (
    <SettlementShell orgName={org.name} date={today}>
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center gap-3">
          <Link href="/member/settlement" className="text-sm text-gray-400 hover:text-gray-600">
            ← 목록
          </Link>
          <span className="text-sm font-semibold text-gray-800 bg-gray-100 px-4 py-2 rounded-lg">
            {periodLabel}
          </span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {(lines ?? []).length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">상세 내역이 없습니다</div>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
                <span>날짜:</span>
                <span className="w-32 text-right">금액:</span>
              </div>
              <div className="divide-y divide-gray-100">
                {(lines ?? []).map(line => {
                  const date = dateMap[line.source_doc_id] ?? line.source_doc_id
                  return (
                    <div key={line.id} className="grid grid-cols-[1fr_auto] gap-4 items-center px-5 py-3">
                      <Link
                        href={`/member/spec?date=${date}`}
                        className="text-sm text-brand-600 bg-gray-100 px-3 py-1.5 rounded hover:bg-gray-200 transition-colors"
                      >
                        {date}
                      </Link>
                      <span className="w-32 text-right text-sm text-gray-800 bg-gray-100 px-3 py-1.5 rounded">
                        {fmt(Number(line.amount))}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-gray-600">합계</span>
            <span className="text-sm font-semibold text-gray-800 bg-gray-100 px-4 py-1.5 rounded min-w-28 text-right">
              {fmt(total)}
            </span>
          </div>
          {otherOutstanding > 0 && (
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-gray-600">이전 미수금</span>
              <span className="text-sm font-semibold text-red-500 bg-red-50 px-4 py-1.5 rounded min-w-28 text-right">
                {fmt(otherOutstanding)}
              </span>
            </div>
          )}
          {otherOutstanding > 0 && !isPending && (
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50">
              <span className="text-sm font-semibold text-gray-700">소계</span>
              <span className="text-sm font-bold text-gray-900 bg-gray-100 px-4 py-1.5 rounded min-w-28 text-right">
                {fmt(totalDue)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-gray-600">납부액</span>
            <span className="text-sm font-semibold text-gray-800 bg-gray-100 px-4 py-1.5 rounded min-w-28 text-right">
              {isPending ? fmt(0) : fmt(total - outstanding)}
            </span>
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-gray-600">미수금</span>
            <div className="flex items-center gap-3">
              {isPending ? (
                <span className="text-sm font-semibold text-gray-400 bg-gray-100 px-4 py-1.5 rounded min-w-28 text-right">
                  청구 전
                </span>
              ) : (
                <span className={`text-sm font-semibold px-4 py-1.5 rounded min-w-28 text-right ${
                  totalDue > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-800'
                }`}>
                  {fmt(totalDue)}
                </span>
              )}
              <PayButton
                disabled={isPaid}
                amount={totalDue}
                orderName="미수금 결제"
                refType="receivable"
              />
            </div>
          </div>
        </div>
      </div>
    </SettlementShell>
  )
}
