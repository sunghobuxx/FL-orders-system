export const runtime = 'edge'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

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
    const { user } = await getSessionUser()
    if (!user) return Response.json({ error: '인증 필요' }, { status: 401 })

    const db = createAdminClient()

    // 3. payments 테이블에 기록
    await db.from('payments').insert({
      target_type: refType === 'receivable' ? 'receivable' : 'receivable',
      target_id: refId ?? null,
      amount,
      direction: 'inbound',
      method: 'card',
      paid_at: new Date().toISOString(),
      created_by: user.id,
    })

    // 4. receivable 잔액 업데이트 (refId가 receivable ID인 경우)
    if (refId && refType === 'receivable') {
      const { data: recv } = await db
        .from('receivables')
        .select('balance')
        .eq('id', refId)
        .single()

      if (recv) {
        const newBalance = Math.max(0, Number(recv.balance) - amount)
        await db
          .from('receivables')
          .update({ balance: newBalance, status: newBalance === 0 ? 'paid' : 'partial' })
          .eq('id', refId)
      }
    }

    return Response.json({ ok: true, paymentKey: tossData.paymentKey, status: tossData.status })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
