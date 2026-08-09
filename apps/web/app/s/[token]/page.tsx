export const runtime = 'edge'

import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetch-all'

/**
 * 로그인 없이 보는 정산서.
 *
 * 문자·알림톡을 받은 거래처가 그 자리에서 열 수 있어야 한다. 로그인부터 하라고 하면
 * 아무도 안 본다. 대신 명세서 내역이 담기므로 유효기간(7일)으로 노출을 제한한다.
 */

interface Props {
  params: Promise<{ token: string }>
}

const won = (n: number) => `${Math.round(Number(n ?? 0)).toLocaleString('ko-KR')}원`

export default async function SharedStatementPage({ params }: Props) {
  const { token } = await params
  const db = createAdminClient()

  const { data: link } = await db
    .from('statement_share_links')
    .select('statement_id, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!link || new Date(link.expires_at) < new Date()) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="max-w-sm text-center space-y-2">
          <p className="text-lg font-semibold text-gray-800">기간이 지난 링크입니다</p>
          <p className="text-sm text-gray-500">
            정산서는 발송일로부터 7일간 볼 수 있습니다. 다시 필요하시면 담당자에게 문의해 주세요.
          </p>
        </div>
      </main>
    )
  }

  const { data: stmt } = await db
    .from('sales_statements')
    .select('id, total_amount, restaurant_id, settlement_periods(start_date, end_date), restaurants(organizations(name))')
    .eq('id', link.statement_id)
    .maybeSingle()

  if (!stmt) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <p className="text-sm text-gray-500">정산서를 찾을 수 없습니다.</p>
      </main>
    )
  }

  const rest = Array.isArray(stmt.restaurants) ? stmt.restaurants[0] : stmt.restaurants
  const org = Array.isArray(rest?.organizations) ? rest.organizations[0] : rest?.organizations
  const period = Array.isArray(stmt.settlement_periods) ? stmt.settlement_periods[0] : stmt.settlement_periods

  const lines = await fetchAll<{ amount: number; source_doc_id: string }>(() => db
    .from('sales_statement_lines')
    .select('amount, source_doc_id')
    .eq('sales_statement_id', stmt.id))

  const specIds = lines.map(l => l.source_doc_id).filter(Boolean)
  const specs = specIds.length
    ? await fetchAll<{ id: string; business_date: string; total_amount: number }>(() => db
        .from('daily_specs').select('id, business_date, total_amount').in('id', specIds))
    : []
  const dateOf = new Map(specs.map(s => [s.id, s.business_date]))

  const rows = lines
    .map(l => ({ date: dateOf.get(l.source_doc_id) ?? '', amount: Number(l.amount ?? 0) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const { data: recvs } = await db
    .from('receivables').select('balance, statement_id').eq('restaurant_id', stmt.restaurant_id)
  const carryover = (recvs ?? [])
    .filter((r: { statement_id: string }) => r.statement_id !== stmt.id)
    .reduce((s: number, r: { balance: number }) => s + Number(r.balance ?? 0), 0)

  const current = Number(stmt.total_amount ?? 0)

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs text-gray-400">FruitLife 정산서</p>
          <p className="text-base font-bold text-gray-900 mt-0.5">{org?.name ?? '거래처'}</p>
          <p className="text-sm text-gray-500 mt-0.5">
            {period?.start_date} ~ {period?.end_date}
          </p>
        </div>

        <div className="divide-y divide-gray-100">
          {rows.map((r, i) => (
            <div key={`${r.date}-${i}`} className="flex justify-between px-5 py-2.5">
              <span className="text-sm text-gray-600">{r.date}</span>
              <span className="text-sm text-gray-800 tabular-nums">{won(r.amount)}</span>
            </div>
          ))}
        </div>

        <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">당기 청구</span>
            <span className="text-gray-800 tabular-nums">{won(current)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">이전 미수금</span>
            <span className="text-gray-800 tabular-nums">{won(carryover)}</span>
          </div>
          <div className="flex justify-between text-base font-bold pt-1.5 border-t border-gray-200">
            <span className="text-gray-900">총 청구액</span>
            <span className="text-gray-900 tabular-nums">{won(current + carryover)}</span>
          </div>
        </div>
      </div>
    </main>
  )
}
