export const runtime = 'edge'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

interface Props {
  searchParams: Promise<{ paymentKey?: string; orderId?: string; amount?: string }>
}

export default async function PaymentSuccessPage({ searchParams }: Props) {
  const { paymentKey, orderId, amount: amountStr } = await searchParams
  const amount = Number(amountStr ?? 0)

  if (!paymentKey || !orderId || !amount) redirect('/member/settlement')

  const secretKey = process.env.TOSS_SECRET_KEY ?? ''
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

  const { user } = await getSessionUser()
  if (user) {
    const db = createAdminClient()
    await db.from('payments').insert({
      target_type: 'receivable',
      target_id: null,
      amount,
      direction: 'inbound',
      method: 'card',
      paid_at: new Date().toISOString(),
      created_by: user.id,
    })
  }

  redirect('/member/settlement?payment=success')
}
