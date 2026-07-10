export const runtime = 'edge'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import OrderShell from '../order/OrderShell'
import { DateNav } from './DateNav'
import DeleteOrderButton from './DeleteOrderButton'

const STEPS = [
  { key: 'submitted', label: '당일발주' },
  { key: 'validated', label: '알림톡 발송' },
  { key: 'ordered', label: '배송중' },
  { key: 'dispatched', label: '배송완료' },
]

const CATEGORY_EMOJI: Record<string, string> = {
  vegetable: '🥬', fruit: '🍎', meat: '🥩', seafood: '🐟',
  grain: '🌾', dairy: '🥛', seasoning: '🧄', etc: '📦',
}

function getStepIndex(status: string) {
  const idx = STEPS.findIndex(s => s.key === status)
  return idx === -1 ? (status === 'completed' ? 3 : 0) : idx
}

export default async function OrderConfirmPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: dateParam } = await searchParams
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

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]

  if (!restaurant) return (
    <OrderShell orgName={org.name} date={dateParam ?? today}>
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">식당 정보가 없습니다.</div>
    </OrderShell>
  )

  let currentDate = dateParam ?? today
  let batch: { id: string; status: string; submitted_at: string | null } | null = null

  if (dateParam) {
    const { data } = await supabase
      .from('order_batches')
      .select('id, status, submitted_at')
      .eq('restaurant_id', restaurant.id)
      .eq('business_date', dateParam)
      .maybeSingle()
    batch = data
  } else {
    const tomorrow = new Date(Date.now() + 9 * 60 * 60 * 1000 + 86400000).toISOString().split('T')[0]
    for (const d of [today, tomorrow]) {
      const { data } = await supabase
        .from('order_batches')
        .select('id, status, submitted_at')
        .eq('restaurant_id', restaurant.id)
        .eq('business_date', d)
        .maybeSingle()
      if (data) { batch = data; currentDate = d; break }
    }
  }

  if (!batch) return (
    <OrderShell orgName={org.name} date={currentDate}>
      <DateNav currentDate={currentDate} />
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <p className="text-gray-400 text-sm">{currentDate} 발주 내역이 없습니다</p>
        <Link href="/member/order" className="rounded-lg bg-gray-800 text-white px-5 py-2.5 text-sm font-semibold">
          발주하러 가기
        </Link>
      </div>
    </OrderShell>
  )

  const { data: latestOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('batch_id', batch.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let items: any[] = []
  if (latestOrder) {
    const { data } = await supabase
      .from('order_items')
      .select('id, qty, unit, products(standard_name, image_path, category)')
      .eq('order_id', latestOrder.id)
    items = data ?? []
  }

  const stepIndex = getStepIndex(batch.status)
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const afterCutoff = 60 * kstNow.getUTCHours() + kstNow.getUTCMinutes() >= 120
  const canEdit = (batch.status === 'open' || batch.status === 'submitted') && currentDate === today && !afterCutoff

  return (
    <OrderShell orgName={org.name} date={currentDate}>
      <div className="space-y-5 max-w-2xl">
        <DateNav currentDate={currentDate} />

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
            <span>① 품목</span>
            <span className="w-24 text-center">수량</span>
          </div>
          <div className="divide-y divide-gray-100">
            {items.length > 0 ? items.map(item => {
              const product = item.products
              const emoji = CATEGORY_EMOJI[product?.category] ?? '📦'
              return (
                <div key={item.id} className="grid grid-cols-[1fr_auto] gap-4 items-center px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 overflow-hidden">
                      {product?.image_path
                        ? <img src={product.image_path} alt={product.standard_name} className="w-full h-full object-cover" />
                        : <span className="text-lg">{emoji}</span>
                      }
                    </div>
                    <span className="text-sm text-gray-800 font-medium truncate">{product?.standard_name}</span>
                  </div>
                  <span className="w-24 text-center text-sm text-gray-700 bg-gray-100 px-3 py-1.5 rounded">
                    {Number(item.qty) % 1 === 0 ? Number(item.qty) : Number(item.qty).toFixed(1)} {item.unit}
                  </span>
                </div>
              )
            }) : (
              <div className="px-5 py-8 text-center text-sm text-gray-400">주문 항목이 없습니다</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 font-medium mb-4">② 현재상황</p>
          <div className="relative flex items-start justify-between">
            <div className="absolute inset-x-0 top-3 h-0.5 bg-gray-200" />
            <div
              className="absolute top-3 h-0.5 bg-brand-600 transition-all"
              style={{ width: `${stepIndex / (STEPS.length - 1) * 100}%` }}
            />
            {STEPS.map((step, i) => (
              <div key={step.key} className="relative flex flex-col items-center gap-1.5 z-10">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
                  i <= stepIndex ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-300 text-gray-400'
                }`}>
                  {i < stepIndex ? '✓' : i + 1}
                </div>
                <span className={`text-xs whitespace-nowrap ${i === stepIndex ? 'text-brand-600 font-semibold' : 'text-gray-400'}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {afterCutoff && currentDate === today && (batch.status === 'open' || batch.status === 'submitted') && (
          <div className="rounded-lg bg-orange-50 border border-orange-200 px-4 py-2.5 text-sm text-orange-700 text-center">
            발주 마감 시간(02:00)이 지났습니다. 수정이 필요하면 운영팀에 문의해주세요.
          </div>
        )}

        <div className="flex gap-3 pt-1">
          {canEdit ? (
            <>
              <DeleteOrderButton batchId={batch.id} />
              <Link
                href="/member/order"
                className="flex-1 text-center rounded-lg bg-brand-600 text-white text-sm font-semibold py-3 hover:bg-brand-700"
              >
                발주 수정
              </Link>
            </>
          ) : (batch.status === 'open' || batch.status === 'submitted') && currentDate === today ? (
            <span className="flex-1 text-center rounded-lg bg-gray-300 text-gray-500 text-sm font-semibold py-3 cursor-not-allowed">
              발주 마감됨 (02:00~)
            </span>
          ) : null}
          <Link
            href={`/member/spec?date=${currentDate}`}
            className="flex-1 text-center rounded-lg bg-gray-800 text-white text-sm font-semibold py-3 hover:bg-gray-700"
          >
            명세서
          </Link>
        </div>
      </div>
    </OrderShell>
  )
}
