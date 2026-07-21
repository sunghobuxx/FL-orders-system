export const runtime = 'edge'

import { getSessionUser } from '@/lib/supabase/server'
import { recordMemberReceivablePayment } from '@/lib/member-payments'

export async function POST(req: Request) {
  try {
    const { paymentKey, orderId, amount, refId, refType } = await req.json() as {
      paymentKey: string
      orderId: string
      amount: number
      refId?: string
      refType?: string
    }

    if (!paymentKey || !orderId || !amount) {
      return Response.json({ error: '필수 파라미터 누락' }, { status: 400 })
    }

    // 1. Toss 결제 승인 API 호출
    const secretKey = process.env.TOSS_SECRET_KEY ?? ''
    const encoded = btoa(`${secretKey}:`)

    const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${encoded}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    })

    const tossData = await tossRes.json() as {
      paymentKey?: string
      status?: string
      code?: string
      message?: string
    }

    if (!tossRes.ok) {
      return Response.json(
        { error: tossData.message ?? '결제 승인 실패', code: tossData.code },
        { status: tossRes.status }
      )
    }

    // 2. 세션 확인
    const { user, supabase } = await getSessionUser()
    if (!user) return Response.json({ error: '인증 필요' }, { status: 401 })
    const { data: membership } = await supabase
      .from('memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!membership?.organization_id) return Response.json({ error: '업체 정보 없음' }, { status: 403 })

    const result = await recordMemberReceivablePayment({
      userId: user.id,
      organizationId: membership.organization_id,
      amount,
      paymentKey,
      preferredReceivableId: refType === 'receivable' ? refId : null,
    })
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 })

    return Response.json({ ok: true, paymentKey: tossData.paymentKey, status: tossData.status, appliedAmount: result.appliedAmount })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
