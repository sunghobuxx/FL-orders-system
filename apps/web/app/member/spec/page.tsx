export const runtime = 'edge'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import SettlementShell from '../settlement/SettlementShell'

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
    .select('id, business_date, total_amount, daily_spec_lines(id, product_name, qty, unit, unit_price, amount, vat_amount, taxable_flag, price_overridden)')
    .eq('restaurant_id', restaurant.id)
    .eq('business_date', targetDate)
    .maybeSingle()

  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

  return (
    <SettlementShell orgName={org.name} date={targetDate}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">{targetDate} 명세서</h2>
          {spec && (
            <Link href={`/member/spec/print?date=${targetDate}`}
              className="text-xs text-brand-600 hover:underline">프린트</Link>
          )}
        </div>
        {!spec ? (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-sm text-gray-400 text-center">
            명세서가 없습니다.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {(spec.daily_spec_lines as unknown as { id: string; product_name: string; qty: number; unit: string; unit_price: number; amount: number }[]).map(line => (
                <div key={line.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <div className="text-sm text-gray-900">{line.product_name}</div>
                    <div className="text-xs text-gray-400">{line.qty}{line.unit} × {fmt(line.unit_price)}</div>
                  </div>
                  <span className="text-sm font-semibold text-gray-800">{fmt(line.amount)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-t border-gray-200">
              <span className="text-sm font-semibold text-gray-700">합계</span>
              <span className="text-base font-bold text-brand-700">{fmt(spec.total_amount ?? 0)}</span>
            </div>
          </div>
        )}
      </div>
    </SettlementShell>
  )
}
