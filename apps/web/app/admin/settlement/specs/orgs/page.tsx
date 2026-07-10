export const runtime = 'edge'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminSettlementShell from '../../AdminSettlementShell'
import MonthPicker from './MonthPicker'

interface Props {
  searchParams: Promise<{ month?: string }>
}

export default async function SpecOrgsPage({ searchParams }: Props) {
  const { month: monthParam } = await searchParams
  const db = createAdminClient()

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const currentMonth = monthParam ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const [y, m] = currentMonth.split('-').map(Number)
  const startDate = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: specs, error } = await db
    .from('daily_specs')
    .select('id, business_date, total_amount, restaurants(organization_id, organizations(name))')
    .gte('business_date', startDate)
    .lte('business_date', endDate)
    .order('business_date', { ascending: false })

  if (error) {
    return (
      <AdminSettlementShell>
        <p className="text-red-500 text-sm p-4">에러: {error.message}</p>
      </AdminSettlementShell>
    )
  }

  type SpecRow = {
    id: string
    business_date: string
    total_amount: number | null
    restaurants: { organization_id: string | null; organizations: { name: string } | null } | null
  }
  const rows = (specs ?? []) as unknown as SpecRow[]

  // Group by org, keep latest date and total
  const orgMap = new Map<string, { orgId: string; orgName: string; total: number; count: number; lastDate: string }>()
  for (const spec of rows) {
    const orgId = spec.restaurants?.organization_id ?? 'unknown'
    const orgName = spec.restaurants?.organizations?.name ?? '알 수 없음'
    const amount = spec.total_amount ?? 0
    const existing = orgMap.get(orgId)
    if (existing) {
      existing.total += amount
      existing.count += 1
      if (spec.business_date > existing.lastDate) existing.lastDate = spec.business_date
    } else {
      orgMap.set(orgId, { orgId, orgName, total: amount, count: 1, lastDate: spec.business_date })
    }
  }
  const orgs = [...orgMap.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.total - a.total)
  const grandTotal = orgs.reduce((s, o) => s + o.total, 0)
  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'
  const monthLabel = `${y}년 ${m}월`

  return (
    <AdminSettlementShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">{monthLabel} 명세서 내역</h2>
          <div className="flex items-center gap-3">
            <MonthPicker value={currentMonth} />
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
            <p className="px-5 py-10 text-sm text-gray-400 text-center">해당 월 명세서가 없습니다.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {orgs.map(org => (
                <Link
                  key={org.orgId}
                  href={`/admin/settlement/specs/org/${org.orgId}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-gray-800">{org.orgName}</span>
                    <span className="text-xs text-gray-400">{org.count}건 · 최근 {org.lastDate}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-700">{fmt(org.total)}</span>
                    <span className="text-gray-300 text-sm">›</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminSettlementShell>
  )
}
