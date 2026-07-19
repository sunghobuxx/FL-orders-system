export const runtime = 'edge'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionUser } from '@/lib/supabase/server'
import TossPaymentWidget from './TossPaymentWidget'

interface Props {
  searchParams: Promise<{ amount?: string; orderName?: string; refType?: string; refId?: string }>
}

export default async function MemberPaymentPage({ searchParams }: Props) {
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { amount: amountStr, orderName, refType, refId } = await searchParams
  const amount = Number(amountStr ?? 0)

  const { data: membership } = await supabase
    .from('memberships').select('organizations(id, name)').eq('user_id', user.id).single()
  const orgData = membership?.organizations
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string; name: string } | undefined
  if (!org) redirect('/member/dashboard')

  const tossClientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? ''
  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-10 px-4 gap-4">
      {/* 업체명 + 금액 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 w-full max-w-sm">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-base font-bold text-gray-900">{org.name}</p>
            {orderName && <p className="text-sm text-gray-400 mt-0.5">{orderName}</p>}
          </div>
          <p className="text-xl font-bold text-gray-900">{fmt(amount)}</p>
        </div>
      </div>

      {tossClientKey ? (
        <TossPaymentWidget
          clientKey={tossClientKey}
          amount={amount}
          orderName={orderName ?? '미수금 결제'}
          orgName={org.name}
          refId={refId}
          refType={refType}
        />
      ) : (
        /* 계좌이체 안내 */
        <div className="bg-white rounded-2xl border border-gray-200 p-5 w-full max-w-sm space-y-4">
          <p className="text-sm text-gray-700">아래 계좌로 입금해 주세요.</p>

          <div className="rounded-xl border border-gray-200 overflow-hidden text-sm">
            <div className="flex justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-gray-500">은행</span>
              <span className="font-semibold text-gray-900">NH농협은행</span>
            </div>
            <div className="flex justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-gray-500">계좌번호</span>
              <span className="font-semibold text-gray-900 tracking-wide">302-1748-8091-81</span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-gray-500">예금주</span>
              <span className="font-semibold text-gray-900">차숙희</span>
            </div>
          </div>

          <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 flex justify-between items-center">
            <span className="text-sm text-green-700 font-medium">입금 금액</span>
            <span className="text-lg font-bold text-green-700">{fmt(amount)}</span>
          </div>

          <Link
            href="/member/settlement"
            className="block w-full text-center rounded-xl border border-gray-200 bg-white py-3.5 text-sm font-semibold text-gray-800 hover:bg-gray-50"
          >
            확인
          </Link>
        </div>
      )}
    </div>
  )
}
