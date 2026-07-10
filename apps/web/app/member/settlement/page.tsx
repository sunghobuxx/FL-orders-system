export const runtime = 'edge'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import SettlementShell from './SettlementShell'

export default async function MemberSettlementPage() {
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

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, settlement_cycle')
    .eq('organization_id', org.id)
    .single()

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
  const fmt = (n: number) => `${n.toLocaleString()}원`

  if (!restaurant) return (
    <SettlementShell orgName={org.name} date={today}>
      <div className="text-gray-400 text-sm text-center py-16">식당 정보가 없습니다.</div>
    </SettlementShell>
  )

  const cycle = restaurant.settlement_cycle ?? 'monthly'

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const fromDate = sixMonthsAgo.toISOString().split('T')[0]

  const { data: dailySpecs } = await supabase
    .from('daily_specs')
    .select('id, business_date, total_amount')
    .eq('restaurant_id', restaurant.id)
    .gte('business_date', fromDate)
    .order('business_date', { ascending: false })

  const { data: receivables } = await supabase
    .from('receivables')
    .select('id, balance, status, due_date, statement_id, sales_statements(settlement_period_id, settlement_periods(start_date, end_date, period_type))')
    .eq('restaurant_id', restaurant.id)
    .order('due_date', { ascending: false })

  const totalOutstanding = (receivables ?? [])
    .filter(r => r.status !== 'paid' && Number(r.balance) > 0)
    .reduce((sum, r) => sum + Number(r.balance), 0)

  // Build outstanding by period key
  const outstandingByPeriod: Record<string, { totalBalance: number; status: string; ids: string[]; start_date: string; end_date: string }> = {}
  for (const r of receivables ?? []) {
    const stmt = r.sales_statements as any
    const period = stmt?.settlement_periods
    if (!period) continue
    const key = cycle === 'weekly' ? period.start_date : period.start_date.slice(0, 7)
    if (!outstandingByPeriod[key]) {
      outstandingByPeriod[key] = { totalBalance: 0, status: 'paid', ids: [], start_date: period.start_date, end_date: period.end_date }
    }
    if (r.status !== 'paid' && Number(r.balance) > 0) {
      outstandingByPeriod[key].totalBalance += Number(r.balance)
      outstandingByPeriod[key].status = r.status
      outstandingByPeriod[key].ids.push(r.id)
    }
  }

  function getMondayOf(dateStr: string) {
    const d = new Date(dateStr)
    const day = d.getUTCDay()
    d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day))
    return d.toISOString().split('T')[0]
  }

  function getSundayOf(mondayStr: string) {
    const d = new Date(mondayStr)
    d.setUTCDate(d.getUTCDate() + 6)
    return d.toISOString().split('T')[0]
  }

  const grouped = new Map<string, {
    key: string; label: string; startDate: string; endDate: string;
    total: number; outstanding: number; receivableId: string | undefined; receivableStatus: string | undefined
  }>()

  for (const spec of dailySpecs ?? []) {
    let key: string, label: string, startDate: string, endDate: string

    if (cycle === 'weekly') {
      startDate = getMondayOf(spec.business_date)
      endDate = getSundayOf(startDate)
      key = startDate
      const [, sm, sd] = startDate.split('-')
      const [, em, ed] = endDate.split('-')
      label = `${Number(sm)}/${Number(sd)} ~ ${Number(em)}/${Number(ed)}`
    } else {
      const [y, m] = spec.business_date.split('-')
      key = `${y}-${m}`
      label = `${y}년 ${Number(m)}월`
      startDate = `${y}-${m}-01`
      const lastDay = new Date(Number(y), Number(m), 0).getDate()
      endDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
    }

    const periodData = outstandingByPeriod[startDate] ?? outstandingByPeriod[cycle === 'weekly' ? startDate.slice(0, 7) : key]
    const existing = grouped.get(key)
    if (existing) {
      existing.total += Number(spec.total_amount)
    } else {
      grouped.set(key, {
        key, label, startDate, endDate,
        total: Number(spec.total_amount),
        outstanding: periodData ? periodData.totalBalance : 0,
        receivableId: periodData?.ids[0],
        receivableStatus: periodData?.status,
      })
    }
  }

  const rows = [...grouped.values()]

  return (
    <SettlementShell orgName={org.name} date={today}>
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${cycle === 'weekly' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
            {cycle === 'weekly' ? '주정산' : '월정산'}
          </span>
          {totalOutstanding > 0 && (
            <span className="text-sm font-bold text-red-600">총 미수금: {fmt(totalOutstanding)}</span>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-400">
            정산 내역이 없습니다
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
              <span>기간</span>
              <span className="w-24 text-right">납품합계</span>
              <span className="w-24 text-right">미수금</span>
              <span className="w-16 text-center">결제</span>
            </div>
            <div className="divide-y divide-gray-100">
              {rows.map(row => {
                const isPending = row.endDate >= today && row.outstanding === 0 && row.total > 0
                const isPaid = row.outstanding === 0 && !isPending
                return (
                  <div key={row.key} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-5 py-3">
                    <Link
                      href={`/member/settlement/history?from=${row.startDate}&to=${row.endDate}`}
                      className="text-sm text-brand-600 bg-gray-100 px-3 py-1.5 rounded font-medium hover:bg-gray-200"
                    >
                      {row.label}
                    </Link>
                    <span className="w-24 text-right text-sm text-gray-800 bg-gray-100 px-3 py-1.5 rounded">
                      {fmt(row.total)}
                    </span>
                    <span className={`w-24 text-right text-sm font-semibold px-3 py-1.5 rounded ${
                      isPending ? 'bg-gray-100 text-gray-500' : isPaid ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                    }`}>
                      {isPending ? '청구 전' : isPaid ? '완납' : fmt(row.outstanding)}
                    </span>
                    {isPaid || isPending ? (
                      <span className="w-16 text-center text-xs font-semibold text-gray-400">
                        {isPaid ? '✓ 완납' : '-'}
                      </span>
                    ) : (
                      <Link
                        href={`/member/payment?amount=${row.outstanding}&orderName=${encodeURIComponent(`${row.label} 미수금`)}&refId=${row.receivableId ?? ''}&refType=receivable`}
                        className="w-16 text-center text-xs font-semibold bg-brand-600 text-white px-2 py-1.5 rounded hover:bg-brand-700"
                      >
                        결제
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
            {totalOutstanding > 0 && (
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-5 py-4 bg-gray-50 border-t border-gray-200">
                <span className="text-sm font-semibold text-gray-700">총미수금액</span>
                <span className="w-24" />
                <span className="w-24 text-right text-sm font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded">
                  {fmt(totalOutstanding)}
                </span>
                <Link
                  href={`/member/payment?amount=${totalOutstanding}&orderName=${encodeURIComponent('전체 미수금 결제')}&refType=receivable`}
                  className="w-16 text-center text-xs font-semibold bg-gray-800 text-white px-2 py-1.5 rounded hover:bg-gray-700"
                >
                  전체결제
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </SettlementShell>
  )
}
