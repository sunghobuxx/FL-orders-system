export const runtime = 'edge'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminSettlementShell from '../../../AdminSettlementShell'

interface Props {
  params: Promise<{ orgId: string }>
}

export default async function OrgSpecsPage({ params }: Props) {
  const { orgId } = await params
  const db = createAdminClient()

  const [{ data: orgData }, { data: restaurantRows }] = await Promise.all([
    db.from('organizations').select('name').eq('id', orgId).single(),
    db.from('restaurants').select('id').eq('organization_id', orgId),
  ])

  if (!orgData) notFound()

  const orgName = orgData.name as string
  const restaurantIds = (restaurantRows ?? []).map(r => r.id as string)

  if (!restaurantIds.length) {
    return (
      <AdminSettlementShell>
        <p className="text-sm text-gray-400 p-4">식당 정보가 없습니다.</p>
      </AdminSettlementShell>
    )
  }

  const { data: specs } = await db
    .from('daily_specs')
    .select('id, business_date, total_amount')
    .in('restaurant_id', restaurantIds)
    .order('business_date', { ascending: false })
    .order('created_at', { ascending: false })

  type SpecRow = { id: string; business_date: string; total_amount: number | null }
  const rows = (specs ?? []) as unknown as SpecRow[]

  const grandTotal = rows.reduce((s, r) => s + (r.total_amount ?? 0), 0)
  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

  return (
    <AdminSettlementShell>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Link href="/admin/settlement/specs" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← 당일명세서
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">{orgName}</h2>
          <span className="text-sm text-gray-500">총 {rows.length}건 · {fmt(grandTotal)}</span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-sm text-gray-400 text-center">명세서가 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">날짜</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(spec => (
                  <tr key={spec.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/admin/settlement/specs/${spec.id}`} className="block">
                        <span className="inline-block bg-green-50 text-green-600 font-medium px-2.5 py-1 rounded">
                          {spec.business_date}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      <Link href={`/admin/settlement/specs/${spec.id}`} className="block">
                        {fmt(spec.total_amount ?? 0)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminSettlementShell>
  )
}
