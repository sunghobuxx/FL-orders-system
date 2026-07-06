export const runtime = 'edge'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

interface Props {
  params: Promise<{ restaurantId: string }>
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
    .select('id, period_start, period_end, total_amount, paid_amount, status')
    .eq('restaurant_id', restaurantId)
    .order('period_start', { ascending: false })
    .limit(24)

  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

  const STATUS_LABEL: Record<string, string> = { paid: '완납', partial: '부분납', unpaid: '미납', overdue: '연체' }
  const STATUS_COLOR: Record<string, string> = {
    paid: 'bg-green-100 text-green-700',
    partial: 'bg-yellow-100 text-yellow-700',
    unpaid: 'bg-red-100 text-red-700',
    overdue: 'bg-red-200 text-red-800',
  }

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <a href="/admin/settlement/history" className="text-sm text-gray-400 hover:text-gray-700">← 정산 내역</a>
        <h1 className="text-lg font-bold text-gray-900">{restaurantName} 정산 내역</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {(statements ?? []).length === 0 ? (
          <p className="px-5 py-12 text-sm text-gray-400 text-center">정산 내역이 없습니다</p>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
              <span>정산 기간</span>
              <span className="text-right">청구금액</span>
              <span className="text-right">납부금액</span>
              <span className="text-center">상태</span>
              <span></span>
            </div>
            <div className="divide-y divide-gray-100">
              {(statements ?? []).map(stmt => (
                <div key={stmt.id} className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-3 items-center px-5 py-3">
                  <span className="text-sm text-gray-700">
                    {stmt.period_start} ~ {stmt.period_end}
                  </span>
                  <span className="text-sm font-medium text-gray-900 text-right">{fmt(Number(stmt.total_amount))}</span>
                  <span className="text-sm text-gray-600 text-right">{fmt(Number(stmt.paid_amount ?? 0))}</span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full text-center ${STATUS_COLOR[stmt.status ?? 'unpaid'] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[stmt.status ?? 'unpaid'] ?? stmt.status}
                  </span>
                  <Link href={`/admin/settlement/restaurant/${restaurantId}/${stmt.id}`} className="text-xs text-brand-600 hover:underline">
                    상세
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
