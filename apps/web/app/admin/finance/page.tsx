export const runtime = 'edge'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import RecordPaymentButton from './RecordPaymentButton'

export default async function AdminFinancePage() {
  const db = createAdminClient()

  // 미수금 (unpaid/partial/overdue receivables) — 업체별 합산
  const { data: receivables } = await db
    .from('receivables')
    .select('id, restaurant_id, balance, due_date, status, statement_id, restaurants(organizations(name))')
    .in('status', ['unpaid', 'partial', 'overdue'])
    .order('due_date', { ascending: true })

  type RecvRow = {
    id: string
    restaurant_id: string
    balance: number
    due_date: string
    status: string
    statement_id: string | null
    restaurants: { organizations: { name: string } | null } | null
  }
  const rows = (receivables ?? []) as unknown as RecvRow[]

  // 업체별 합산
  const byRestaurant = new Map<string, { name: string; total: number; restaurantId: string; oldest: string }>()
  for (const r of rows) {
    const name = r.restaurants?.organizations?.name ?? '알 수 없음'
    const existing = byRestaurant.get(r.restaurant_id)
    if (existing) {
      existing.total += Number(r.balance)
    } else {
      byRestaurant.set(r.restaurant_id, {
        name,
        total: Number(r.balance),
        restaurantId: r.restaurant_id,
        oldest: r.due_date,
      })
    }
  }

  const grouped = [...byRestaurant.values()].sort((a, b) => b.total - a.total)
  const totalOutstanding = grouped.reduce((s, r) => s + r.total, 0)
  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">입/출금 (미수금)</h1>
        <div className="text-sm font-bold text-red-600">{fmt(totalOutstanding)}</div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {grouped.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">미수금 내역이 없습니다</p>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
              <span>업체명</span>
              <span className="text-right">미수금</span>
              <span className="text-center">명세서내역</span>
              <span className="text-center">입/출금</span>
            </div>
            <div className="divide-y divide-gray-100">
              {grouped.map(r => (
                <div key={r.restaurantId} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-5 py-3.5">
                  <span className="text-sm font-medium text-gray-900">{r.name}</span>
                  <span className="text-sm font-bold text-red-500 text-right">{fmt(r.total)}</span>
                  <Link
                    href={`/admin/settlement/history`}
                    className="text-xs text-brand-600 hover:underline text-center"
                  >
                    명세서내역
                  </Link>
                  <div className="flex justify-center">
                    <RecordPaymentButton restaurantId={r.restaurantId} restaurantName={r.name} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-t border-gray-200">
              <span className="text-sm font-bold text-gray-700">합계</span>
              <span className="text-sm font-bold text-red-600">{fmt(totalOutstanding)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
