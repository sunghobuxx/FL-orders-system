export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-member-user'
import { applyMatch } from '@/lib/payments/apply-match'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/**
 * 「입금 확인」 화면에서 은행 거래 하나를 특정 업체의 입금으로 확정한다.
 * 실제 반영·별칭 등록은 `lib/payments/apply-match.ts` 가 한다 — auto-match 배치(자동확정)도 같은
 * 함수를 쓴다(2026-09-29). 여기서는 로그인·입력값 확인과 원인을 HTTP 상태로 바꾸는 것만 한다.
 */
export async function POST(req: Request) {
  try {
    const { bankTransactionId, restaurantId } = await req.json() as { bankTransactionId?: string; restaurantId?: string }
    if (!bankTransactionId || !restaurantId) {
      return NextResponse.json({ error: '필수 값이 없습니다.' }, { status: 400 })
    }

    // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user, db } = session

    const result = await applyMatch(db, { bankTransactionId, restaurantId, createdBy: user.id })

    if (!result.ok) {
      switch (result.reason) {
        case 'NOT_FOUND':
          return NextResponse.json({ error: '은행 거래를 찾을 수 없습니다.' }, { status: 404 })
        case 'NOT_INBOUND':
          return NextResponse.json({ error: '입금이 아닌 거래는 확정할 수 없습니다.' }, { status: 400 })
        case 'ALREADY_POSTED_OTHER':
          return NextResponse.json({ error: '이미 다른 업체의 입금으로 반영된 거래입니다.' }, { status: 409 })
        case 'RPC_ERROR':
          if (result.message === 'NO_RECEIVABLES') {
            return NextResponse.json({ error: '이 업체는 미수금 내역이 없습니다.' }, { status: 404 })
          }
          if (result.message === 'OVERPAY') {
            // applyMatch 는 RPC 오류만 넘기고 은행 거래 금액을 다시 조회하진 않으니, 여기서는 detail(미수금 합계)만 쓴다.
            const totalOutstanding = Number(result.details ?? 0)
            return NextResponse.json({
              error: `이 업체의 미수금은 ${won(totalOutstanding)}원입니다. 입금액과 맞는지 업체를 다시 확인해 주세요.`,
            }, { status: 400 })
          }
          console.error('[confirm-bank-transaction] rpc error', result.message)
          return NextResponse.json({ error: '입금 확정 실패' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      applied: result.applied,
      updatedCount: result.updatedCount,
      alreadyPosted: result.alreadyPosted,
    })
  } catch (e) {
    console.error('[confirm-bank-transaction] unexpected error', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
