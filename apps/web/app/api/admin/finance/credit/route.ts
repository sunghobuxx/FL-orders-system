export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-member-user'

/**
 * 업체 적립금 상계·환불 (2026-10-06 결정: 상계는 사장님이 버튼으로 확인해서, 환불도 가능).
 * 실제 계산은 DB 함수가 한다 — offset_restaurant_credit / refund_restaurant_credit.
 * 여기서는 로그인·입력값 확인과 DB 오류를 HTTP 상태로 바꾸는 것만 한다.
 */
const ERROR_MESSAGES: Record<string, { status: number; message: string }> = {
  INSUFFICIENT_CREDIT: { status: 400, message: '적립금 잔액보다 많이 상계·환불할 수 없습니다.' },
  OFFSET_EXCEEDS_RECEIVABLE: { status: 400, message: '미수금보다 많이 상계할 수 없습니다.' },
  INVALID_AMOUNT: { status: 400, message: '금액은 1원 이상의 정수여야 합니다.' },
  RESTAURANT_NOT_FOUND: { status: 404, message: '업체를 찾을 수 없습니다.' },
}

export async function POST(req: Request) {
  try {
    const { restaurantId, action, amount, note } = await req.json() as {
      restaurantId?: string; action?: 'offset' | 'refund'; amount?: number; note?: string
    }
    if (!restaurantId || (action !== 'offset' && action !== 'refund') || !amount) {
      return NextResponse.json({ error: '필수 값이 없습니다.' }, { status: 400 })
    }

    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user, db } = session

    const { data, error } = action === 'offset'
      ? await db.rpc('offset_restaurant_credit', { p_restaurant_id: restaurantId, p_amount: amount, p_created_by: user.id })
      : await db.rpc('refund_restaurant_credit', { p_restaurant_id: restaurantId, p_amount: amount, p_created_by: user.id, p_note: note ?? null })

    if (error) {
      const code = Object.keys(ERROR_MESSAGES).find(k => error.message.includes(k))
      if (code) {
        const { status, message } = ERROR_MESSAGES[code]
        const detail = error.details ? ` (잔액: ${Number(error.details).toLocaleString('ko-KR')}원)` : ''
        return NextResponse.json({ error: message + detail }, { status })
      }
      console.error('[finance/credit] rpc error', error.message)
      return NextResponse.json({ error: '적립금 처리 실패' }, { status: 500 })
    }

    return NextResponse.json({ success: true, result: data })
  } catch (e) {
    console.error('[finance/credit] unexpected error', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
