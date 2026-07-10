export const runtime = 'edge'

import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import TossWidget from './TossWidget'

const TOSS_CLIENT_KEY = 'test_ck_placeholder'
const tossEnabled = !TOSS_CLIENT_KEY.includes('placeholder')

export default async function MemberPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ amount?: string; orderName?: string; refId?: string; refType?: string }>
}) {
  const { amount: amountParam, orderName: orderNameParam } = await searchParams
  const amount = Number(amountParam)
  if (!amount || amount <= 0) redirect('/member/settlement')

  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships').select('organizations(id, name)').eq('user_id', user.id).single()
  const orgData = membership?.organizations
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string; name: string } | undefined

  const customerKey = org?.id ?? user.id
  const customerName = org?.name ?? user.email ?? '고객'
  const orderName = orderNameParam ?? 'FruitLife 정산'
  const orderId = `FL-${Date.now()}-${(org?.id ?? user.id).replace(/-/g, '').slice(0, 8)}`

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start pt-10 px-4">
      <div className="w-full max-w-md space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">{customerName}</span>
            <span className="text-lg font-bold text-gray-900">{amount.toLocaleString()}원</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">{orderName}</p>
        </div>

        {tossEnabled ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <TossWidget
              clientKey={TOSS_CLIENT_KEY}
              customerKey={customerKey}
              amount={amount}
              orderId={orderId}
              orderName={orderName}
              customerName={customerName}
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <p className="text-sm text-gray-600">아래 계좌로 입금해 주세요.</p>
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-4 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">은행</span>
                <span className="text-sm font-semibold text-gray-900">NH농협은행</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">계좌번호</span>
                <span className="text-base font-bold text-gray-900 tracking-wide">3021748809181</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">예금주</span>
                <span className="text-sm font-semibold text-gray-900">차숙희</span>
              </div>
            </div>
            <div className="flex justify-between items-center rounded-lg bg-brand-50 border border-brand-200 px-4 py-3">
              <span className="text-sm text-gray-600">입금 금액</span>
              <span className="text-lg font-bold text-brand-700">{amount.toLocaleString()}원</span>
            </div>
            <a
              href="/member/settlement"
              className="block w-full text-center rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              확인
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
