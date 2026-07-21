export const runtime = 'edge'

import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import { recordMemberReceivablePayment } from '@/lib/member-payments'

interface Props {
  searchParams: Promise<{ paymentKey?: string; orderId?: string; amount?: string; refId?: string; refType?: string }>
}

export default async function PaymentSuccessPage({ searchParams }: Props) {
  const { paymentKey, orderId, amount: amountStr, refId, refType } = await searchParams
  const amount = Number(amountStr ?? 0)

  if (!paymentKey || !orderId || !amount) redirect('/member/settlement')

  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership?.organization_id) redirect('/member/settlement')

  const secretKey = process.env.TOSS_SECRET_KEY ?? ''
  if (!secretKey) redirect('/member/payment/fail?message=%EA%B2%B0%EC%A0%9C%20%EC%84%A4%EC%A0%95%EC%9D%84%20%ED%99%95%EC%9D%B8%ED%95%B4%EC%A3%BC%EC%84%B8%EC%9A%94')
  const encoded = btoa(`${secretKey}:`)

  const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: { Authorization: `Basic ${encoded}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  })

  if (!tossRes.ok) {
    const err = await tossRes.json() as { message?: string }
    redirect(`/member/payment/fail?message=${encodeURIComponent(err.message ?? '결제 승인 실패')}`)
  }

  const result = await recordMemberReceivablePayment({
    userId: user.id,
    organizationId: membership.organization_id,
    amount,
    paymentKey,
    preferredReceivableId: refType === 'receivable' ? refId : null,
  })
  if (!result.ok) {
    redirect(`/member/payment/fail?message=${encodeURIComponent(result.error)}`)
  }

  redirect('/member/settlement?payment=success')
}
