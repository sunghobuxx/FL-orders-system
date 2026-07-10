export const runtime = 'edge'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminSettlementShell from '@/app/admin/settlement/AdminSettlementShell'

export default async function AdminFinancePage() {
  const db = createAdminClient()
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: receivables } = await db
    .from('receivables')
    .select('id, balance, restaurant_id, restaurants(organizations(name))')
    .in('status', ['unpaid', 'partial', 'overdue'])
    .order('due_date')

  type RecvRow = {
    id: string
    restaurant_id: string
    balance: number
    restaurants: { organizations: { name: string } | null } | null
  }
  const rows = (receivables ?? []) as unknown as RecvRow[]

  const map = new Map<string, { name: string; balance: number; restaurantId: string }>()
  for (const r of rows) {
    const name = r.restaurants?.organizations?.name ?? '알 수 없음'
    const existing = map.get(r.restaurant_id) ?? { name, balance: 0, restaurantId: r.restaurant_id }
    existing.balance += Number(r.balance)
    map.set(r.restaurant_id, existing)
  }

  const fmt = (n: number) => `${n.toLocaleString()}원`

  return (
    <AdminSettlementShell>
      <div className="space-y-3 max-w-3xl">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">날짜:</span>
          <span className="bg-gray-100 text-gray-500 px-4 py-1.5 rounded">{today}</span>
        </div>

        {map.size === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-sm text-gray-400">
            미수금 내역이 없습니다
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
              <span>① 업체명:</span>
              <span className="w-32 text-right">미수금:</span>
            </div>
            <div className="divide-y divide-gray-100">
              {[...map.values()].map(r => (
                <div key={r.restaurantId} className="grid grid-cols-[1fr_auto] gap-3 items-center px-5 py-3">
                  <Link
                    href={`/admin/finance/${r.restaurantId}`}
                    className="text-sm text-brand-600 bg-gray-100 px-3 py-1.5 rounded font-medium hover:bg-gray-200 transition-colors"
                  >
                    {r.name}
                  </Link>
                  <span className={`w-32 text-right text-sm font-semibold px-3 py-1.5 rounded ${r.balance > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-800'}`}>
                    {fmt(r.balance)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminSettlementShell>
  )
}
