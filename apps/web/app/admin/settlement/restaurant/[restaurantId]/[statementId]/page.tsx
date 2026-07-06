export const runtime = 'edge'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

interface Props {
  params: Promise<{ restaurantId: string; statementId: string }>
}

export default async function AdminSettlementStatementPage({ params }: Props) {
  const { restaurantId, statementId } = await params
  const db = createAdminClient()

  const { data: stmt } = await db
    .from('sales_statements')
    .select('id, period_start, period_end, total_amount, paid_amount, status, restaurants(organizations(name))')
    .eq('id', statementId)
    .eq('restaurant_id', restaurantId)
    .single()

  if (!stmt) notFound()

  const orgRaw = (stmt.restaurants as unknown as { organizations: { name: string } | null } | null)
  const restaurantName = orgRaw?.organizations?.name ?? '알 수 없음'

  const { data: lines } = await db
    .from('statement_lines')
    .select('id, spec_date, amount, description')
    .eq('statement_id', statementId)
    .order('spec_date', { ascending: true })

  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/admin/settlement/restaurant/${restaurantId}`} className="text-sm text-gray-400 hover:text-gray-700">← 정산 목록</Link>
        <h1 className="text-lg font-bold text-gray-900">{restaurantName}</h1>
        <span className="text-sm text-gray-500">{stmt.period_start} ~ {stmt.period_end}</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '청구금액', value: fmt(Number(stmt.total_amount)), color: 'text-gray-900' },
          { label: '납부금액', value: fmt(Number(stmt.paid_amount ?? 0)), color: 'text-green-700' },
          { label: '잔액', value: fmt(Number(stmt.total_amount) - Number(stmt.paid_amount ?? 0)), color: 'text-red-600' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 px-4 py-4">
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className={`text-base font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">명세서 항목</h2>
        </div>
        {(lines ?? []).length === 0 ? (
          <p className="px-5 py-10 text-sm text-gray-400 text-center">항목이 없습니다</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {(lines ?? []).map(line => (
              <div key={line.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="text-sm text-gray-800">{line.spec_date}</span>
                  {line.description && (
                    <span className="text-xs text-gray-500 ml-2">{line.description}</span>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-900">{fmt(Number(line.amount))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
