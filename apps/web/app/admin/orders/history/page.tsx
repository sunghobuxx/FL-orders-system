export const runtime = 'edge'

import Link from 'next/link'

import { createAdminClient } from '@/lib/supabase/admin'

import AdminOrderShell from '../AdminOrderShell'

const STATUS_LABEL: Record<string, string> = {
  open: '작성 중', submitted: '당일발주', validated: '알림톡 발송',
  ordered: '배송중', dispatched: '배송완료', completed: '완료',
}
const STATUS_COLOR: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  validated: 'bg-purple-100 text-purple-700',
  ordered: 'bg-yellow-100 text-yellow-700',
  dispatched: 'bg-green-100 text-green-700',
  completed: 'bg-green-100 text-green-700',
}

interface Props {
  searchParams: Promise<{ date?: string }>
}

export default async function OrderHistoryPage({ searchParams }: Props) {
  const { date: dateParam } = await searchParams
  const adminDb = createAdminClient()
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0] // KST
  const targetDate = dateParam ?? today

  const from = new Date(new Date(targetDate).getTime() - 30 * 86400000).toISOString().split('T')[0]
  const to = new Date(new Date(targetDate).getTime() + 1 * 86400000).toISOString().split('T')[0]

  const { data: batches } = await adminDb
    .from('order_batches')
    .select('id, status, business_date, submitted_at, restaurants(organizations(name))')
    .gte('business_date', from)
    .lte('business_date', to)
    .order('business_date', { ascending: false })
    .order('submitted_at', { ascending: false })

  type BatchRow = NonNullable<typeof batches>[number]
  const byDate = new Map<string, BatchRow[]>()
  for (const b of batches ?? []) {
    const d = b.business_date
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)?.push(b)
  }

  // DB 함수로 batch_id별 주문금액 합산 (URL 길이 제한 우회)
  const amountByBatch: Record<string, number> = {}
  const { data: amountRows } = await adminDb.rpc('get_batch_amounts', { from_date: from, to_date: to })
  for (const row of amountRows ?? []) {
    amountByBatch[(row as { batch_id: string; total_amount: number }).batch_id] =
      Number((row as { batch_id: string; total_amount: number }).total_amount)
  }

  const fmt = (n: number) => `${n.toLocaleString()}원`

  return (
    <AdminOrderShell date={targetDate}>
      <div className="space-y-3 max-w-3xl">
        {byDate.size === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-sm text-gray-400">
            주문 내역이 없습니다
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
              <span>날짜</span>
              <span className="text-center">업체수</span>
              <span className="text-center">주문금액</span>
              <span className="text-center">배송상태</span>
            </div>
            <div className="divide-y divide-gray-100">
              {[...byDate.entries()].map(([date, batchList]) => {
                const totalAmount = batchList.reduce((s, b) => s + (amountByBatch[b.id] ?? 0), 0)
                const latestStatus = batchList[0]?.status ?? 'submitted'
                return (
                  <div key={date} className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-3 items-center px-5 py-3">
                    <Link
                      href={`/admin/orders?date=${date}`}
                      className="text-sm text-brand-600 bg-gray-100 px-3 py-1.5 rounded font-medium hover:bg-gray-200 transition-colors"
                    >
                      {date}
                    </Link>
                    <Link
                      href={`/admin/orders?date=${date}`}
                      className="text-sm text-center text-gray-700 bg-gray-100 px-3 py-1.5 rounded hover:bg-gray-200 transition-colors"
                    >
                      {batchList.length}개
                    </Link>
                    <span className="text-sm text-center text-gray-700 bg-gray-100 px-3 py-1.5 rounded">
                      {fmt(totalAmount)}
                    </span>
                    <span className={`text-xs text-center font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[latestStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[latestStatus] ?? latestStatus}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <p className="text-xs text-gray-400 text-center">선택 날짜 기준 ±30일</p>
      </div>
    </AdminOrderShell>
  )
}
