export const runtime = 'edge'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminSettlementShell from '@/app/admin/settlement/AdminSettlementShell'
import { PaymentForm } from './PaymentForm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdminFinanceDetailPage({ params }: Props) {
  const { id: restaurantId } = await params
  const db = createAdminClient()

  const { data: restaurant } = await db
    .from('restaurants')
    .select('id, organizations(name)')
    .eq('id', restaurantId)
    .single()

  if (!restaurant) notFound()

  const orgRaw = restaurant.organizations as unknown as { name: string } | null
  const restaurantName = orgRaw?.name ?? '알 수 없음'

  const { data: receivables } = await db
    .from('receivables')
    .select('id, balance, status, due_date')
    .eq('restaurant_id', restaurantId)
    .order('due_date')

  const totalBalance = (receivables ?? []).reduce((s, r) => s + Number(r.balance), 0)

  // 결제 내역
  const receivableIds = (receivables ?? []).map(r => r.id)
  const { data: payments } = receivableIds.length > 0
    ? await db
        .from('payments')
        .select('id, amount, method, direction, paid_at')
        .in('target_id', receivableIds)
        .eq('target_type', 'receivable')
        .order('paid_at', { ascending: false })
        .limit(50)
    : { data: [] }

  const fmt = (n: number) => `${n.toLocaleString()}원`

  return (
    <AdminSettlementShell>
      <div className="space-y-4 max-w-3xl">
        <Link href="/admin/finance" className="text-sm text-gray-400 hover:text-gray-600">
          ← 목록
        </Link>

        {/* 헤더 */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">업체명:</span>
            <span className="bg-gray-100 px-3 py-1.5 rounded font-semibold text-gray-800">
              {restaurantName}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">총미수금:</span>
            <span className={`px-3 py-1.5 rounded font-semibold ${totalBalance > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-700'}`}>
              {fmt(totalBalance)}
            </span>
          </div>
        </div>

        {/* 입금액 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
            ① 입금액:
          </div>
          <div className="px-5 py-4">
            <PaymentForm restaurantId={restaurantId} totalBalance={totalBalance} />
          </div>
        </div>

        {/* 결제내역 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
            <span>결제내역</span>
            <span className="w-16 text-center">방법</span>
            <span className="w-28 text-right">금액</span>
          </div>
          {(payments ?? []).length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">결제 내역이 없습니다</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {(payments ?? []).map(p => {
                const isCard = p.method === 'card'
                return (
                  <div key={p.id} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-5 py-3">
                    <span className="text-sm text-gray-700 bg-gray-100 px-3 py-1.5 rounded">
                      {new Date(p.paid_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                    </span>
                    <span className={`w-16 text-center text-xs font-semibold px-2 py-1.5 rounded ${isCard ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                      {isCard ? '카드' : '입금'}
                    </span>
                    <span className="w-28 text-right text-sm font-semibold text-gray-800 bg-gray-100 px-3 py-1.5 rounded">
                      {p.direction === 'inbound' ? '' : '-'}{fmt(Number(p.amount))}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AdminSettlementShell>
  )
}
