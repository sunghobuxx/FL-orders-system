export const runtime = 'edge'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'
import AdminOrderShell from './AdminOrderShell'
import OrderActionButtons from './OrderActionButtons'
import StatusButton from './StatusButton'
import BatchControls from './BatchControls'
import { getKstToday } from '@/lib/date-kst'

interface Props {
  searchParams: Promise<{ date?: string }>
}

export default async function AdminOrdersPage({ searchParams }: Props) {
  const { date: dateParam } = await searchParams
  const today = getKstToday()
  const targetDate = dateParam ?? today

  const adminDb = createAdminClient()

  // 현재 로그인 유저의 역할 + 담당 업체 확인
  const { user } = await getSessionUser()
  let assignedRestaurantIds: string[] | null = null
  if (user) {
    const { data: membership } = await adminDb
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
    if (membership?.role === 'manager') {
      const { data: assigned } = await adminDb
        .from('manager_restaurants')
        .select('restaurant_id')
        .eq('user_id', user.id)
      if (assigned && assigned.length > 0) {
        assignedRestaurantIds = (assigned as { restaurant_id: string }[]).map(a => a.restaurant_id)
      } else {
        assignedRestaurantIds = []
      }
    }
  }

  let query = adminDb
    .from('order_batches')
    .select('id, status, business_date, submitted_at, restaurants(organizations(name)), orders(order_items(id))')
    .eq('business_date', targetDate)
    .neq('status', 'completed')
    .order('submitted_at', { ascending: false })

  if (assignedRestaurantIds !== null) {
    if (assignedRestaurantIds.length === 0) {
      // 담당 업체 없으면 빈 결과
      query = query.in('restaurant_id', ['00000000-0000-0000-0000-000000000000'])
    } else {
      query = query.in('restaurant_id', assignedRestaurantIds)
    }
  }

  const { data: batches } = await query

  const STATUS_LABEL: Record<string, string> = {
    open: '작성 중', submitted: '당일발주', validated: '알림톡 발송',
    ordered: '배송중', dispatched: '배송완료', completed: '완료',
  }
  const STATUS_COLOR: Record<string, string> = {
    open: 'bg-gray-100 text-gray-500',
    submitted: 'bg-blue-100 text-blue-700',
    validated: 'bg-purple-100 text-purple-700',
    ordered: 'bg-yellow-100 text-yellow-700',
    dispatched: 'bg-green-100 text-green-700',
    completed: 'bg-green-100 text-green-700',
  }

  function fmtKstTime(iso: string | null) {
    if (!iso) return null
    const d = new Date(iso)
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
    const month = kst.getUTCMonth() + 1
    const day = kst.getUTCDate()
    const hour = kst.getUTCHours()
    const min = String(kst.getUTCMinutes()).padStart(2, '0')
    const ampm = hour < 12 ? '오전' : '오후'
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    return `${String(month).padStart(2, '0')}. ${String(day).padStart(2, '0')}. ${ampm} ${h12}:${min}`
  }

  return (
    <AdminOrderShell date={targetDate}>
      <div className="space-y-4 max-w-3xl">
        {/* 상단 액션 버튼 */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">총 {(batches ?? []).length}개 업체</span>
          <OrderActionButtons businessDate={targetDate} />
        </div>

        {/* 업체별 발주 목록 */}
        {(batches ?? []).length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-sm text-gray-400">
            발주 없음
          </div>
        ) : (
          <div className="space-y-3">
            {(batches ?? []).map(batch => {
              const restRaw = batch.restaurants as unknown as { organizations: { name: string } | null } | null
              const orgName = restRaw?.organizations?.name ?? '알 수 없음'
              type OrderWithItems = { order_items: { id: string }[] }
              const itemCount = (batch.orders as unknown as OrderWithItems[] | null)
                ?.reduce((sum, o) => sum + o.order_items.length, 0) ?? 0
              const timeStr = fmtKstTime(batch.submitted_at as string | null)
              return (
                <div key={batch.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* 상단: 업체명 + 품목수 */}
                  <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                    <Link
                      href={`/admin/orders/${batch.id}`}
                      className="text-sm font-semibold text-gray-900 hover:text-brand-600 transition-colors"
                    >
                      {orgName}
                    </Link>
                    <span className="text-sm text-gray-500">{itemCount}개</span>
                  </div>
                  {/* 하단: 타임스탬프 + 상태 + 액션 */}
                  <div className="px-5 py-3 space-y-2">
                    <div className="flex items-center gap-3">
                      {timeStr && <span className="text-xs text-gray-400">{timeStr}</span>}
                      <div className="ml-auto flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABEL[batch.status] ?? batch.status}
                        </span>
                        <StatusButton batchId={batch.id} currentStatus={batch.status} />
                      </div>
                    </div>
                    <BatchControls batchId={batch.id} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AdminOrderShell>
  )
}
