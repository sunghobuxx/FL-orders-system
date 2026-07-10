export const runtime = 'edge'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminSettlementShell from '../AdminSettlementShell'
import DayPicker from './DatePicker'

interface Props {
  searchParams: Promise<{ date?: string }>
}

export default async function AdminSpecsPage({ searchParams }: Props) {
  const { date: dateParam } = await searchParams
  const db = createAdminClient()

  const todayStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const targetDate = dateParam ?? todayStr

  const { data: specs, error: specsError } = await db
    .from('daily_specs')
    .select('id, business_date, total_amount, restaurants(organization_id, organizations(name))')
    .eq('business_date', targetDate)
    .order('total_amount', { ascending: false })

  if (specsError) {
    return (
      <AdminSettlementShell>
        <p className="text-red-500 text-sm p-4">에러: {specsError.message}</p>
      </AdminSettlementShell>
    )
  }

  type SpecRow = {
    id: string
    business_date: string
    total_amount: number | null
    restaurants: {
      organization_id: string | null
      organizations: { name: string } | null
    } | null
  }
  const rows = (specs ?? []) as unknown as SpecRow[]

  // Group by organization, keep spec IDs for direct link
  const orgMap = new Map<string, { orgId: string; orgName: string; total: number; specIds: string[] }>()
  for (const spec of rows) {
    const orgId = spec.restaurants?.organization_id ?? 'unknown'
    const orgName = spec.restaurants?.organizations?.name ?? '알 수 없음'
    const amount = spec.total_amount ?? 0
    const existing = orgMap.get(orgId)
    if (existing) {
      existing.total += amount
      existing.specIds.push(spec.id)
    } else {
      orgMap.set(orgId, { orgId, orgName, total: amount, specIds: [spec.id] })
    }
  }
  const orgs = [...orgMap.values()].sort((a, b) => b.total - a.total)
  const grandTotal = orgs.reduce((s, o) => s + o.total, 0)

  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

  return (
    <AdminSettlementShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">{targetDate} 명세서</h2>
          <div className="flex items-center gap-3">
            <DayPicker value={targetDate} />
            <span className="text-sm text-gray-500">{orgs.length}개 업체</span>
          </div>
        </div>

        {grandTotal > 0 && (
          <div className="text-right text-sm text-gray-500">
            합계: <span className="font-bold text-gray-800">{fmt(grandTotal)}</span>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {orgs.length === 0 ? (
            <p className="px-5 py-10 text-sm text-gray-400 text-center">해당 날짜 명세서가 없습니다.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {orgs.map(org => {
                // 명세서 1개면 바로 상세, 여러 개면 업체 이력으로
                const href = org.specIds.length === 1
                  ? `/admin/settlement/specs/${org.specIds[0]}`
                  : `/admin/settlement/specs/org/${org.orgId}`
                return (
                  <Link
                    key={org.orgId}
                    href={href}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-800">{org.orgName}</span>
                    <div className="flex items-center gap-2.5">
                      {org.specIds.length > 1 && (
                        <span className="text-xs text-gray-400">{org.specIds.length}건</span>
                      )}
                      <span className="text-sm font-semibold text-gray-700">{fmt(org.total)}</span>
                      <span className="text-gray-300 text-sm">›</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AdminSettlementShell>
  )
}
