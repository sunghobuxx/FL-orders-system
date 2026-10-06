export const runtime = 'edge'

import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetch-all'
import AdminSettlementShell from '@/app/admin/settlement/AdminSettlementShell'
import FinanceTabs from '../FinanceTabs'
import CreditActions from './CreditActions'

/**
 * 「적립금」 화면. 초과입금으로 쌓인 적립 잔액(원장 합계)과 미수금을 업체별로 보여주고,
 * 사장님이 버튼으로 상계하거나 환불한다(2026-10-06 결정). 자동 상계는 하지 않는다.
 */
export default async function CreditsPage() {
  const db = createAdminClient()

  const { data: restaurantRows } = await db
    .from('restaurants')
    .select('id, organizations(name, organization_type, status)')
    .eq('organizations.organization_type', 'restaurant')
  type RestRow = { id: string; organizations: { name: string; organization_type: string; status: string } | null }
  const restaurants = ((restaurantRows ?? []) as unknown as RestRow[])
    .filter(r => r.organizations?.organization_type === 'restaurant' && r.organizations?.status === 'active')

  const ledger = await fetchAll(() => db.from('restaurant_credit_ledger').select('restaurant_id, amount'))
  const creditBy = new Map<string, number>()
  for (const row of ledger as Array<{ restaurant_id: string; amount: number }>) {
    creditBy.set(row.restaurant_id, (creditBy.get(row.restaurant_id) ?? 0) + Number(row.amount))
  }

  const receivables = await fetchAll(() => db
    .from('receivables')
    .select('restaurant_id, balance')
    .in('status', ['unpaid', 'partial', 'overdue']))
  const receivableBy = new Map<string, number>()
  for (const row of receivables as Array<{ restaurant_id: string; balance: number }>) {
    receivableBy.set(row.restaurant_id, (receivableBy.get(row.restaurant_id) ?? 0) + Number(row.balance))
  }

  const rows = restaurants
    .map(r => ({
      id: r.id,
      name: r.organizations?.name ?? '알 수 없음',
      credit: creditBy.get(r.id) ?? 0,
      receivable: receivableBy.get(r.id) ?? 0,
    }))
    .filter(r => r.credit !== 0 || r.receivable > 0)
    .sort((a, b) => b.credit - a.credit)

  const fmt = (n: number) => `${Math.round(n).toLocaleString()}원`

  return (
    <AdminSettlementShell>
      <div className="space-y-3 max-w-4xl">
        <FinanceTabs />
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">적립금</h2>
            <p className="text-xs text-gray-500">초과입금은 적립금으로 쌓입니다. 상계와 환불은 사장님이 버튼으로 확인해서 합니다.</p>
          </div>
          {rows.length === 0 ? (
            <div className="text-sm text-gray-500 py-6 text-center">적립금이나 미수금이 있는 업체가 없습니다.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {rows.map(r => (
                <div key={r.id} className="py-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-gray-900">{r.name}</div>
                    <div className="text-sm text-gray-600">
                      적립 <span className="font-semibold text-blue-700">{fmt(r.credit)}</span>
                      {' · '}미수 <span className="font-semibold text-red-600">{fmt(r.receivable)}</span>
                    </div>
                  </div>
                  <CreditActions restaurantId={r.id} credit={r.credit} receivable={r.receivable} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminSettlementShell>
  )
}
