export const runtime = 'edge'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKstToday } from '@/lib/date-kst'

interface Props {
  params: Promise<{ supplierId: string }>
  searchParams: Promise<{ month?: string }>
}

export default async function AdminPurchaseSupplierPage({ params, searchParams }: Props) {
  const { supplierId } = await params
  const { month: monthParam } = await searchParams

  const db = createAdminClient()

  const { data: supplier } = await db
    .from('suppliers')
    .select('id, organizations(name)')
    .eq('id', supplierId)
    .single()

  if (!supplier) notFound()

  const orgRaw = supplier.organizations as unknown as { name: string } | null
  const supplierName = orgRaw?.name ?? '알 수 없음'

  const today = getKstToday()
  const currentMonth = monthParam ?? today.slice(0, 7)
  const [year, month] = currentMonth.split('-').map(Number)
  const from = `${currentMonth}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${currentMonth}-${String(lastDay).padStart(2, '0')}`

  const { data: jobs } = await db
    .from('dispatch_jobs')
    .select('id, business_date, status, dispatch_job_items(id, qty, unit, dispatch_job_items_products:products(standard_name))')
    .eq('supplier_id', supplierId)
    .eq('status', 'sent')
    .gte('business_date', from)
    .lte('business_date', to)
    .order('business_date', { ascending: false })

  type JobRow = {
    id: string
    business_date: string
    status: string
    dispatch_job_items: { id: string; qty: number; unit: string; dispatch_job_items_products: { standard_name: string } | null }[]
  }
  const rows = (jobs ?? []) as unknown as JobRow[]

  const prevMonth = new Date(year, month - 2, 1).toISOString().slice(0, 7)
  const nextMonth = new Date(year, month, 1).toISOString().slice(0, 7)

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <a href="/admin/purchase" className="text-sm text-gray-400 hover:text-gray-700">← 매입 정산</a>
        <h1 className="text-lg font-bold text-gray-900">{supplierName}</h1>
      </div>

      <div className="flex items-center gap-3">
        <a href={`?month=${prevMonth}`} className="px-3 py-1.5 bg-gray-100 rounded text-gray-500 hover:bg-gray-200 text-sm">←</a>
        <span className="font-semibold text-gray-700">{year}년 {month}월</span>
        <a href={`?month=${nextMonth}`} className="px-3 py-1.5 bg-gray-100 rounded text-gray-500 hover:bg-gray-200 text-sm">→</a>
        <span className="text-xs text-gray-400 ml-2">{rows.length}회 발주</span>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-sm text-gray-400">
          이 달에 발주 내역이 없습니다
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(job => (
            <div key={job.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
                <Link
                  href={`/admin/purchase/${job.business_date}`}
                  className="text-sm font-semibold text-brand-600 hover:underline"
                >
                  {job.business_date}
                </Link>
                <span className="text-xs text-gray-500">{job.dispatch_job_items.length}개 품목</span>
              </div>
              <div className="flex flex-wrap gap-2 px-5 py-3">
                {job.dispatch_job_items.map(item => (
                  <span key={item.id} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded">
                    {item.dispatch_job_items_products?.standard_name ?? '?'} {item.qty}{item.unit}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
