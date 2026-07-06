export const runtime = 'edge'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKstToday } from '@/lib/date-kst'

interface Props {
  searchParams: Promise<{ month?: string }>
}

export default async function AdminPurchasePage({ searchParams }: Props) {
  const { month: monthParam } = await searchParams
  const today = getKstToday()
  const currentMonth = monthParam ?? today.slice(0, 7)
  const [year, month] = currentMonth.split('-').map(Number)
  const from = `${currentMonth}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${currentMonth}-${String(lastDay).padStart(2, '0')}`

  const db = createAdminClient()

  // dispatch_jobs with job_items for the month (매입 기준)
  const { data: jobs } = await db
    .from('dispatch_jobs')
    .select('id, supplier_id, business_date, status, suppliers(organizations(name)), dispatch_job_items(id, qty, unit, dispatch_job_items_products:products(standard_name))')
    .gte('business_date', from)
    .lte('business_date', to)
    .eq('status', 'sent')
    .order('business_date', { ascending: false })

  type JobRow = {
    id: string
    supplier_id: string
    business_date: string
    status: string
    suppliers: { organizations: { name: string } | null } | null
    dispatch_job_items: { id: string; qty: number; unit: string; dispatch_job_items_products: { standard_name: string } | null }[]
  }
  const rows = (jobs ?? []) as unknown as JobRow[]

  // 공급처별 집계
  const bySupplier = new Map<string, { name: string; days: Set<string>; itemCount: number }>()
  for (const job of rows) {
    const name = job.suppliers?.organizations?.name ?? '알 수 없음'
    const existing = bySupplier.get(job.supplier_id)
    if (existing) {
      existing.days.add(job.business_date)
      existing.itemCount += job.dispatch_job_items.length
    } else {
      bySupplier.set(job.supplier_id, { name, days: new Set([job.business_date]), itemCount: job.dispatch_job_items.length })
    }
  }

  const prevMonth = new Date(year, month - 2, 1).toISOString().slice(0, 7)
  const nextMonth = new Date(year, month, 1).toISOString().slice(0, 7)

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-gray-900">매입 정산</h1>
        <a href={`?month=${prevMonth}`} className="px-3 py-1.5 bg-gray-100 rounded text-gray-500 hover:bg-gray-200 text-sm">←</a>
        <span className="font-semibold text-gray-700">{year}년 {month}월</span>
        <a href={`?month=${nextMonth}`} className="px-3 py-1.5 bg-gray-100 rounded text-gray-500 hover:bg-gray-200 text-sm">→</a>
      </div>

      {/* 공급처별 요약 */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">공급처별 발주 현황</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {bySupplier.size === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">이번 달 발주 내역이 없습니다.</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
                <span>공급처명</span>
                <span className="text-center">발주일수</span>
                <span className="text-center">총 품목수</span>
                <span></span>
              </div>
              <div className="divide-y divide-gray-100">
                {[...bySupplier.entries()].map(([supplierId, info]) => (
                  <div key={supplierId} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-5 py-3.5">
                    <span className="text-sm font-medium text-gray-900">{info.name}</span>
                    <span className="text-sm text-center text-gray-600">{info.days.size}일</span>
                    <span className="text-sm text-center text-gray-600">{info.itemCount}건</span>
                    <Link href={`/admin/purchase/supplier/${supplierId}`} className="text-xs text-brand-600 hover:underline">
                      상세
                    </Link>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 일별 발주 */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">일별 발주 내역</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {rows.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">발주 내역이 없습니다.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {[...new Set(rows.map(r => r.business_date))].map(date => {
                const dayJobs = rows.filter(r => r.business_date === date)
                return (
                  <div key={date} className="flex items-center justify-between px-5 py-3.5">
                    <div>
                      <Link href={`/admin/purchase/${date}`} className="text-sm font-medium text-brand-600 hover:underline">
                        {date}
                      </Link>
                      <span className="text-xs text-gray-400 ml-2">{dayJobs.length}개 공급처</span>
                    </div>
                    <Link href={`/admin/purchase/${date}`} className="text-xs text-gray-400 hover:text-gray-600">
                      상세 →
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
