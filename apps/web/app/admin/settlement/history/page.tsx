export const runtime = 'edge'

import Link from 'next/link'

import { getSessionUser } from '@/lib/supabase/server'

import AdminSettlementShell from '../AdminSettlementShell'

interface Props {
  searchParams: Promise<{ month?: string }>
}

export default async function AdminSpecHistoryPage({ searchParams }: Props) {
  const { month: monthParam } = await searchParams
  const { supabase: db, user } = await getSessionUser()

  const today = new Date()
  const currentMonth = monthParam ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const [year, mon] = currentMonth.split('-').map(Number)
  const startDate = `${year}-${String(mon).padStart(2, '0')}-01`
  const lastDay = new Date(year!, mon!, 0).getDate()
  const endDate = `${year}-${String(mon).padStart(2, '0')}-${lastDay}`

  const { data: specs } = await db
    .from('daily_specs')
    .select('id, business_date, total_amount, restaurants(organizations(name))')
    .gte('business_date', startDate)
    .lte('business_date', endDate)
    .order('business_date', { ascending: false })

  const fmt = (n: number) => `${n.toLocaleString()}원`

  return (
    <AdminSettlementShell>
      <div className="space-y-4 max-w-3xl">
        {/* 날짜 필터 (우측) */}
        <div className="flex justify-end items-center gap-2">
          <span className="text-sm text-gray-500">① 날짜:</span>
          <form>
            <input
              type="month"
              name="month"
              defaultValue={currentMonth}
              onChange={undefined}
              className="bg-gray-100 border-0 text-sm text-gray-600 px-3 py-1.5 rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </form>
        </div>

        {(specs ?? []).length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-sm text-gray-400">
            {currentMonth} 명세서가 없습니다
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
              <span>② 날짜</span>
              <span>업체명:</span>
              <span className="w-28 text-right">금액:</span>
            </div>
            <div className="divide-y divide-gray-100">
              {(specs ?? []).map(spec => {
                const restRaw = spec.restaurants as unknown as { organizations: { name: string } | null } | null
                const orgName = restRaw?.organizations?.name ?? '알 수 없음'
                return (
                  <div key={spec.id} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-center px-5 py-3">
                    {/* ② 날짜 클릭 → 당일명세서 상세 */}
                    <Link
                      href={`/admin/settlement/specs/${spec.id}`}
                      className="text-sm text-brand-600 bg-gray-100 px-3 py-1.5 rounded font-medium hover:bg-gray-200 transition-colors"
                    >
                      {spec.business_date}
                    </Link>
                    <span className="text-sm text-gray-800 bg-gray-100 px-3 py-1.5 rounded">{orgName}</span>
                    <span className="w-28 text-right text-sm text-gray-800 bg-gray-100 px-3 py-1.5 rounded">
                      {fmt(Number(spec.total_amount))}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </AdminSettlementShell>
  )
}
