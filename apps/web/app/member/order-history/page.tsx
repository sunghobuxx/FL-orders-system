export const runtime = 'edge'

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getSessionUser } from '@/lib/supabase/server'

import OrderShell from '../order/OrderShell'

const STATUS_LABEL: Record<string, string> = {
  submitted:  '당일발주',
  validated:  '알림톡 발송',
  ordered:    '배송중',
  dispatched: '배송완료',
  completed:  '배송완료',
}

const STATUS_COLOR: Record<string, string> = {
  submitted:  'bg-blue-100 text-blue-700',
  validated:  'bg-purple-100 text-purple-700',
  ordered:    'bg-yellow-100 text-yellow-700',
  dispatched: 'bg-green-100 text-green-700',
  completed:  'bg-green-100 text-green-700',
}

export default async function OrderHistoryPage() {
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships')
    .select('organizations(id, name)')
    .eq('user_id', user.id)
    .single()

  const orgData = membership?.organizations
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string; name: string } | undefined
  if (!org) return (
    <OrderShell orgName="" date="">
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">업체 정보가 없습니다.</div>
    </OrderShell>
  )

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id')
    .eq('organization_id', org.id)
    .single()

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0] // KST

  // 04:00 KST 이후 오늘 발주 마감 (내일 발주는 가능)
  const nowUtc = new Date()
  const kstNow = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000)
  const kstMinutes = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes()
  const isCutoff = kstMinutes >= 240

  if (!restaurant) return (
    <OrderShell orgName={org.name} date={today}>
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">식당 정보가 없습니다.</div>
    </OrderShell>
  )

  const fromDate = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

  const { data: batches } = await supabase
    .from('order_batches')
    .select('id, business_date, status')
    .eq('restaurant_id', restaurant.id)
    .gte('business_date', fromDate)
    .in('status', ['submitted', 'validated', 'ordered', 'dispatched', 'completed'])
    .order('business_date', { ascending: false })

  // 배치별 금액: daily_spec(명세서) 기준, 없으면 order_items fallback
  const batchIds = (batches ?? []).map((b: { id: string }) => b.id)
  const amountByBatch: Record<string, number> = {}

  if (batchIds.length > 0 && restaurant) {
    const dates = (batches ?? []).map((b: { business_date: string }) => b.business_date)

    // 명세서 기준 금액 (실제 청구 기준)
    const { data: specs } = await supabase
      .from('daily_specs')
      .select('business_date, total_amount')
      .eq('restaurant_id', restaurant.id)
      .in('business_date', dates)

    const specByDate: Record<string, number> = {}
    for (const s of specs ?? []) {
      specByDate[s.business_date] = Number(s.total_amount ?? 0)
    }

    // daily_spec이 있는 batch는 명세서 금액, 없는 batch는 order_items 합산
    const noBatchIds: string[] = []
    for (const b of batches ?? []) {
      const bd = (b as { id: string; business_date: string }).business_date
      if (specByDate[bd] !== undefined) {
        amountByBatch[(b as { id: string }).id] = specByDate[bd]
      } else {
        noBatchIds.push((b as { id: string }).id)
      }
    }

    if (noBatchIds.length > 0) {
      const { data: items } = await supabase
        .from('order_items')
        .select('amount, orders!inner(batch_id)')
        .in('orders.batch_id', noBatchIds)

      for (const item of items ?? []) {
        const batchId = (item.orders as unknown as { batch_id: string }).batch_id
        amountByBatch[batchId] = (amountByBatch[batchId] ?? 0) + Number(item.amount ?? 0)
      }
    }
  }

  const fmt = (n: number) => `${n.toLocaleString()}원`

  return (
    <OrderShell orgName={org.name} date={today}>
      <div className="space-y-4 max-w-2xl">
        {(batches ?? []).length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400 text-sm">
            발주 내역이 없습니다
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
                <span>날짜</span>
                <span className="w-28 text-right">금액</span>
                <span className="w-24 text-center">상태</span>
              </div>

              <div className="divide-y divide-gray-100">
                {(batches ?? []).map((batch: { id: string; business_date: string; status: string }) => {
                  const amount = amountByBatch[batch.id] ?? 0
                  return (
                    <div key={batch.id} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-5 py-3">
                      <Link
                        href={`/member/spec?date=${batch.business_date}`}
                        className="text-sm text-brand-600 font-medium bg-gray-100 px-3 py-1.5 rounded hover:bg-gray-200 transition-colors"
                      >
                        {batch.business_date}
                      </Link>
                      <span className="w-28 text-right text-sm font-semibold text-gray-800 bg-gray-100 px-3 py-1.5 rounded">
                        {amount > 0 ? fmt(amount) : '-'}
                      </span>
                      <div className="w-24 text-center">
                        <span className={`text-xs font-semibold px-2 py-1.5 rounded-lg ${STATUS_COLOR[batch.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {STATUS_LABEL[batch.status] ?? batch.status}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <p className="text-xs text-gray-400 text-center">최근 30일 발주 내역</p>
          </>
        )}

        <div className="flex gap-3 pt-2">
          <Link href="/member/order"
            className="flex-1 text-center rounded-lg bg-brand-600 text-white text-sm font-semibold py-3 hover:bg-brand-700">
            {isCutoff ? '내일 발주하기' : '발주하기'}
          </Link>
          <Link href="/member/spec"
            className="flex-1 text-center rounded-lg bg-gray-800 text-white text-sm font-semibold py-3 hover:bg-gray-700">
            당일명세서 확인
          </Link>
        </div>
      </div>
    </OrderShell>
  )
}
