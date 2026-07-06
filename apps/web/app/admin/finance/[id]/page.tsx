export const runtime = 'edge'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

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
    .select('id, balance, due_date, status, statement_id')
    .eq('restaurant_id', restaurantId)
    .in('status', ['unpaid', 'partial', 'overdue'])
    .order('due_date', { ascending: true })

  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'
  const total = (receivables ?? []).reduce((s, r) => s + Number(r.balance), 0)

  const STATUS_LABEL: Record<string, string> = { unpaid: '미납', partial: '부분납', overdue: '연체' }
  const STATUS_COLOR: Record<string, string> = {
    unpaid: 'bg-red-100 text-red-700',
    partial: 'bg-yellow-100 text-yellow-700',
    overdue: 'bg-red-200 text-red-800',
  }

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/admin/finance" className="text-sm text-gray-400 hover:text-gray-700">← 미수금 현황</a>
          <h1 className="text-lg font-bold text-gray-900">{restaurantName}</h1>
        </div>
        <div className="text-sm font-bold text-red-600">{fmt(total)}</div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {(receivables ?? []).length === 0 ? (
          <p className="px-5 py-12 text-sm text-gray-400 text-center">미수금 내역이 없습니다</p>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
              <span>만기일</span>
              <span className="text-right">잔액</span>
              <span className="text-center">상태</span>
              <span></span>
            </div>
            <div className="divide-y divide-gray-100">
              {(receivables ?? []).map(r => (
                <div key={r.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-5 py-3">
                  <span className="text-sm text-gray-700">{r.due_date}</span>
                  <span className="text-sm font-bold text-red-500 text-right">{fmt(Number(r.balance))}</span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full text-center ${STATUS_COLOR[r.status ?? 'unpaid'] ?? ''}`}>
                    {STATUS_LABEL[r.status ?? 'unpaid'] ?? r.status}
                  </span>
                  {r.statement_id ? (
                    <Link href={`/admin/settlement/restaurant/${restaurantId}/${r.statement_id}`} className="text-xs text-brand-600 hover:underline">
                      명세서
                    </Link>
                  ) : <span />}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-t border-gray-200">
              <span className="text-sm font-bold text-gray-700">합계</span>
              <span className="text-sm font-bold text-red-600">{fmt(total)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
