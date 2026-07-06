export const runtime = 'edge'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

interface Props {
  params: Promise<{ date: string }>
}

function shiftDate(d: string, delta: number) {
  const dt = new Date(`${d}T00:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().split('T')[0]
}

export default async function AdminPurchaseDatePage({ params }: Props) {
  const { date } = await params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound()

  const db = createAdminClient()

  const { data: jobs } = await db
    .from('dispatch_jobs')
    .select('id, supplier_id, status, suppliers(organizations(name)), dispatch_job_items(id, qty, unit, dispatch_job_items_products:products(standard_name))')
    .eq('business_date', date)
    .eq('status', 'sent')
    .order('created_at')

  type JobRow = {
    id: string
    supplier_id: string
    status: string
    suppliers: { organizations: { name: string } | null } | null
    dispatch_job_items: { id: string; qty: number; unit: string; dispatch_job_items_products: { standard_name: string } | null }[]
  }
  const rows = (jobs ?? []) as unknown as JobRow[]

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <a href="/admin/purchase" className="text-sm text-gray-400 hover:text-gray-700">← 매입 정산</a>
        <a href={`/admin/purchase/${shiftDate(date, -1)}`} className="px-2 py-1 bg-gray-100 rounded text-gray-500 hover:bg-gray-200 text-sm">←</a>
        <h1 className="text-lg font-bold text-gray-900">{date} 발주 내역</h1>
        <a href={`/admin/purchase/${shiftDate(date, 1)}`} className="px-2 py-1 bg-gray-100 rounded text-gray-500 hover:bg-gray-200 text-sm">→</a>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-sm text-gray-400">
          이 날짜에 발송된 발주가 없습니다
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map(job => {
            const supplierName = job.suppliers?.organizations?.name ?? '알 수 없음'
            return (
              <div key={job.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <Link
                    href={`/admin/purchase/supplier/${job.supplier_id}`}
                    className="text-sm font-semibold text-brand-600 hover:underline"
                  >
                    {supplierName}
                  </Link>
                  <span className="text-xs text-gray-500">{job.dispatch_job_items.length}개 품목</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {job.dispatch_job_items.map(item => (
                    <div key={item.id} className="flex items-center justify-between px-5 py-2.5">
                      <span className="text-sm text-gray-800">
                        {item.dispatch_job_items_products?.standard_name ?? '알 수 없음'}
                      </span>
                      <span className="text-sm font-semibold text-brand-700 bg-brand-50 px-2.5 py-0.5 rounded">
                        {item.qty} {item.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
