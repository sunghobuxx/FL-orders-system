export const runtime = 'edge'

import Link from 'next/link'
import { getSessionUser } from '@/lib/supabase/server'
import AdminSettlementShell from '../AdminSettlementShell'

interface Props {
  searchParams: Promise<{ date?: string }>
}

export default async function AdminSpecsPage({ searchParams }: Props) {
  const { date: dateParam } = await searchParams
  const { supabase: db } = await getSessionUser()

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
  const targetDate = dateParam ?? today

  const { data: specs } = await db
    .from('daily_specs')
    .select('id, business_date, total_amount, organizations(name)')
    .eq('business_date', targetDate)
    .order('created_at', { ascending: false })

  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

  return (
    <AdminSettlementShell>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            type="date"
            defaultValue={targetDate}
            onChange={e => {
              const url = new URL(window.location.href)
              url.searchParams.set('date', e.target.value)
              window.location.href = url.toString()
            }}
            className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-500">{(specs ?? []).length}개</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {(specs ?? []).length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">해당 날짜 명세서가 없습니다.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {(specs ?? []).map(spec => {
                const orgName = (spec.organizations as unknown as { name: string } | null)?.name ?? '알 수 없음'
                return (
                  <Link key={spec.id} href={`/admin/settlement/specs/${spec.id}`}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{orgName}</div>
                      <div className="text-xs text-gray-400">{spec.business_date}</div>
                    </div>
                    <span className="text-sm font-semibold text-gray-800">{fmt(spec.total_amount ?? 0)}</span>
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
