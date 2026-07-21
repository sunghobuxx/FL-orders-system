export const runtime = 'edge'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import OrderShell from '../order/OrderShell'

interface Props {
  searchParams: Promise<{ date?: string }>
}

export default async function OrderConfirmPage({ searchParams }: Props) {
  const { date: dateParam } = await searchParams
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships').select('organizations(id, name)').eq('user_id', user.id).single()
  const orgData = membership?.organizations
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string; name: string } | undefined

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? '') ? dateParam! : today
  const moveDate = (delta: number) => {
    const d = new Date(`${targetDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + delta)
    return d.toISOString().slice(0, 10)
  }

  if (!org) return (
    <OrderShell orgName="" date={targetDate}>
      <div className="text-gray-400 text-sm text-center py-16">업체 정보가 없습니다.</div>
    </OrderShell>
  )

  const { data: restaurant } = await supabase
    .from('restaurants').select('id').eq('organization_id', org.id).single()

  if (!restaurant) return (
    <OrderShell orgName={org.name} date={targetDate}>
      <div className="text-gray-400 text-sm text-center py-16">식당 정보가 없습니다.</div>
    </OrderShell>
  )

  // 선택한 날짜의 발주를 orders -> order_items 관계로 조회한다.
  const { data: batch } = await supabase
    .from('order_batches')
    .select('id, status, business_date, orders(id, order_items(id, qty, unit, unit_price_snapshot, products(standard_name, image_path)))')
    .eq('restaurant_id', restaurant.id)
    .eq('business_date', targetDate)
    .maybeSingle()

  type ConfirmItem = {
    id: string
    qty: number
    unit: string
    unit_price_snapshot: number
    products: { standard_name: string; image_path: string | null } | { standard_name: string; image_path: string | null }[] | null
  }
  type ConfirmOrder = { id: string; order_items: ConfirmItem[] | null }
  const orders = ((batch?.orders ?? []) as unknown as ConfirmOrder[])
  const items = orders.flatMap(order => order.order_items ?? [])

  const STATUS_LABEL: Record<string, string> = {
    open: '작성 중', submitted: '발주완료', validated: '알림톡 발송',
    ordered: '상차', dispatched: '배송완료', completed: '완료',
  }
  const STATUS_COLOR: Record<string, string> = {
    open: 'bg-gray-100 text-gray-500',
    submitted: 'bg-blue-100 text-blue-700',
    validated: 'bg-purple-100 text-purple-700',
    ordered: 'bg-yellow-100 text-yellow-700',
    dispatched: 'bg-green-100 text-green-700',
    completed: 'bg-green-100 text-green-700',
  }
  const STATUS_STEPS = [
    { key: 'submitted', label: '당일발주' },
    { key: 'validated', label: '알림톡발송' },
    { key: 'ordered', label: '배송중' },
    { key: 'dispatched', label: '배송완료' },
  ]
  const statusIndex = batch
    ? batch.status === 'completed'
      ? STATUS_STEPS.length - 1
      : STATUS_STEPS.findIndex(step => step.key === batch.status)
    : -1

  const displayDate = targetDate.split('-').map(Number).join('. ') + '.'

  return (
    <OrderShell orgName={org.name} date={targetDate} hideMeta>
      <div className="space-y-5 pb-4">
        <div className="flex items-center justify-between py-1">
          <p className="text-sm text-gray-500">업체명: <span className="ml-2 inline-block rounded-lg bg-gray-100 px-3 py-2 text-base font-bold text-gray-900">{org.name}</span></p>
          <span className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-400">{targetDate}</span>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/member/order-confirm?date=${moveDate(-1)}`} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-xl text-gray-400" aria-label="이전 날짜">‹</Link>
          <h2 className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-base font-semibold text-gray-700">{displayDate}</h2>
          <Link href={`/member/order-confirm?date=${moveDate(1)}`} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-xl text-gray-400" aria-label="다음 날짜">›</Link>
          {targetDate === today && <span className="ml-1 text-sm font-semibold text-brand-600">오늘</span>}
        </div>
        {!batch ? (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-sm text-gray-400 text-center">
            <p>{targetDate} 발주 내역이 없습니다</p>
            <a href="/member/order" className="mt-3 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              발주하러 가기
            </a>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-500">① 품목</span>
                <span className="text-sm font-semibold text-gray-500">수량</span>
              </div>
              <div className="divide-y divide-gray-100">
                {items.map(item => {
                  const product = Array.isArray(item.products) ? item.products[0] : item.products
                  return (
                  <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-blue-100 bg-blue-50">
                        {product?.image_path
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={product.image_path} alt="" className="h-full w-full object-cover" />
                          : <span className="text-xl">🥬</span>}
                      </div>
                      <div className="truncate text-base font-semibold text-gray-900">{product?.standard_name ?? '품목'}</div>
                    </div>
                    <span className="min-w-28 rounded-lg bg-gray-100 px-4 py-2.5 text-right text-base text-gray-700">{item.qty} {item.unit}</span>
                  </div>
                  )
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 px-5 py-5">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-semibold text-gray-500">② 현재상황</h3>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLOR[batch.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABEL[batch.status] ?? batch.status}
                </span>
              </div>
              <div className="relative grid grid-cols-4 gap-1">
                <div className="absolute left-[12.5%] right-[12.5%] top-3.5 h-1 rounded-full bg-gray-200">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(0, statusIndex) / (STATUS_STEPS.length - 1) * 100}%` }} />
                </div>
                {STATUS_STEPS.map((step, index) => {
                  const done = statusIndex >= index
                  const current = statusIndex === index
                  return (
                    <div key={step.key} className="relative z-10 flex flex-col items-center text-center">
                      <div className={`w-8 h-8 rounded-full border-[3px] flex items-center justify-center text-xs font-bold ${
                        done ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-300 bg-white text-gray-400'
                      }`}>
                        {done && !current ? '✓' : index + 1}
                      </div>
                      <span className={`mt-2 text-xs font-medium ${current || done ? 'text-brand-600' : 'text-gray-400'}`}>{step.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <Link
                href={`/member/spec?date=${targetDate}`}
                className="block w-full rounded-xl bg-gray-800 py-4 text-center text-base font-bold text-white hover:bg-gray-700"
              >
                명세서
              </Link>
            </div>
          </>
        )}
      </div>
    </OrderShell>
  )
}
