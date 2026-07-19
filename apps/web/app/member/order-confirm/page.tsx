export const runtime = 'edge'

import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import OrderShell from '../order/OrderShell'

export default async function OrderConfirmPage() {
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships').select('organizations(id, name)').eq('user_id', user.id).single()
  const orgData = membership?.organizations
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string; name: string } | undefined

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]

  if (!org) return (
    <OrderShell orgName="" date={today}>
      <div className="text-gray-400 text-sm text-center py-16">업체 정보가 없습니다.</div>
    </OrderShell>
  )

  const { data: restaurant } = await supabase
    .from('restaurants').select('id').eq('organization_id', org.id).single()

  if (!restaurant) return (
    <OrderShell orgName={org.name} date={today}>
      <div className="text-gray-400 text-sm text-center py-16">식당 정보가 없습니다.</div>
    </OrderShell>
  )

  // 오늘 발주 배치 확인
  const { data: batch } = await supabase
    .from('order_batches')
    .select('id, status, business_date, order_items(id, product_name, qty, unit, unit_price_snapshot)')
    .eq('restaurant_id', restaurant.id)
    .eq('business_date', today)
    .maybeSingle()

  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

  return (
    <OrderShell orgName={org.name} date={today}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button type="button" className="text-2xl text-gray-400" aria-label="이전 날짜">‹</button>
          <h2 className="text-sm font-semibold text-gray-700">{today}</h2>
          <button type="button" className="text-2xl text-gray-400" aria-label="다음 날짜">›</button>
        </div>
        {!batch ? (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-sm text-gray-400 text-center">
            <p>{today} 발주 내역이 없습니다</p>
            <a href="/member/order" className="mt-3 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              발주하러 가기
            </a>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">발주번호 {batch.id.slice(-8)}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                batch.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                batch.status === 'dispatched' ? 'bg-green-100 text-green-700' :
                'bg-gray-100 text-gray-600'
              }`}>{batch.status}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {(batch.order_items as unknown as { id: string; product_name: string; qty: number; unit: string; unit_price_snapshot: number }[]).map(item => (
                <div key={item.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <div className="text-sm text-gray-900">{item.product_name}</div>
                    <div className="text-xs text-gray-400">{item.qty}{item.unit} × {fmt(item.unit_price_snapshot)}</div>
                  </div>
                  <span className="text-sm font-semibold text-gray-800">{fmt(item.qty * item.unit_price_snapshot)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </OrderShell>
  )
}
