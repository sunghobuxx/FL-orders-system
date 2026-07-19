export const runtime = 'edge'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import SettlementShell from '../settlement/SettlementShell'
import { PrintButton, PayButton } from './SpecActions'

interface Props {
  searchParams: Promise<{ date?: string }>
}

export default async function MemberSpecPage({ searchParams }: Props) {
  const { date: dateParam } = await searchParams
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships').select('organizations(id, name)').eq('user_id', user.id).single()
  const orgData = membership?.organizations
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string; name: string } | undefined

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
  const targetDate = dateParam ?? today
  const isToday = targetDate === today

  if (!org) return (
    <SettlementShell orgName="" date={targetDate}>
      <div className="text-gray-400 text-sm text-center py-16">업체 정보가 없습니다.</div>
    </SettlementShell>
  )

  const { data: restaurant } = await supabase
    .from('restaurants').select('id').eq('organization_id', org.id).single()

  if (!restaurant) return (
    <SettlementShell orgName={org.name} date={targetDate}>
      <div className="text-gray-400 text-sm text-center py-16">식당 정보가 없습니다.</div>
    </SettlementShell>
  )

  const { data: spec } = await supabase
    .from('daily_specs')
    .select('id, business_date, total_amount, daily_spec_lines(id, qty, unit, unit_price, amount, products(standard_name))')
    .eq('restaurant_id', restaurant.id)
    .eq('business_date', targetDate)
    .maybeSingle()

  type SpecLine = { id: string; qty: number; unit: string; unit_price: number; amount: number; products: { standard_name: string } | null }
  const lines = (spec?.daily_spec_lines ?? []) as unknown as SpecLine[]
  const totalAmount = Number(spec?.total_amount ?? 0)

  const { data: receivables } = await supabase
    .from('receivables')
    .select('balance, status')
    .eq('restaurant_id', restaurant.id)
  const previousOutstanding = (receivables ?? [])
    .filter(r => r.status !== 'paid' && Number(r.balance) > 0)
    .reduce((sum, r) => sum + Number(r.balance), 0)
  const cumulativeOutstanding = previousOutstanding + totalAmount

  const fmt = (n: number) => Number(n).toLocaleString('ko-KR')

  return (
    <SettlementShell orgName={org.name} date={targetDate}>
      <div className="space-y-3">
        {/* 헤더: ← 오늘로 + 날짜 */}
        <div className="flex items-center gap-3">
          {!isToday && (
            <Link href="/member/spec" className="text-sm text-gray-400 hover:text-gray-600 shrink-0">
              ← 오늘로
            </Link>
          )}
          <span className="text-sm font-bold text-gray-900">{targetDate} 명세서</span>
        </div>

        {/* 명세 테이블 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* 헤더 */}
          <div className="grid grid-cols-[1fr_80px_90px_90px] gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500">
            <span>품목</span>
            <span className="text-center">수량</span>
            <span className="text-right">단가</span>
            <span className="text-right">금액</span>
          </div>

          {/* 품목 행 */}
          {lines.length === 0 ? (
            <div className="px-4 py-8 text-sm text-gray-400 text-center">
              {targetDate} 납품 내역이 없습니다
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {lines.map(line => {
                const name = (Array.isArray(line.products) ? line.products[0] : line.products)?.standard_name ?? '품목'
                const qtyStr = Number(line.qty) % 1 === 0 ? String(Number(line.qty)) : Number(line.qty).toFixed(1)
                return (
                  <div key={line.id} className="grid grid-cols-[1fr_80px_90px_90px] gap-2 items-center px-4 py-2.5">
                    <span className="text-sm bg-gray-100 rounded-lg px-3 py-1.5 text-gray-800 truncate">{name}</span>
                    <span className="text-sm bg-gray-100 rounded-lg px-2 py-1.5 text-gray-800 text-center">{qtyStr} {line.unit}</span>
                    <span className="text-sm bg-gray-100 rounded-lg px-2 py-1.5 text-gray-800 text-right">{fmt(line.unit_price)}</span>
                    <span className="text-sm bg-gray-100 rounded-lg px-2 py-1.5 text-gray-800 text-right font-semibold">{fmt(line.amount)}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* 합계 + 누적 미수금 */}
          <div className="border-t border-gray-200 divide-y divide-gray-100">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-600">합계금액:</span>
              <span className="text-sm font-bold text-gray-900 bg-gray-100 px-4 py-1.5 rounded-lg min-w-28 text-right">
                {fmt(totalAmount)}원
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-600">누적 미수금:</span>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold px-4 py-1.5 rounded-lg min-w-28 text-right ${
                  cumulativeOutstanding > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-900'
                }`}>
                  {fmt(cumulativeOutstanding)}원
                </span>
                <PayButton
                  disabled={cumulativeOutstanding <= 0}
                  amount={cumulativeOutstanding}
                  orderName="미수금 결제"
                  refType="receivable"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex gap-3">
          <PrintButton date={targetDate} />
          <Link
            href="/member/spec"
            className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-bold text-white text-center hover:bg-green-700"
          >
            확인
          </Link>
        </div>
      </div>
    </SettlementShell>
  )
}
