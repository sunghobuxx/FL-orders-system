export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-member-user'
import { normalizeDepositor } from '@/lib/payments/depositor'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/**
 * 「입금 확인」 화면에서 은행 거래 하나를 특정 업체의 입금으로 확정한다.
 * 실제 반영은 `record_receivable_payment` DB 함수(트랜잭션·행 잠금·거래 멱등) 가 한다 — record-payment
 * 라우트와 같은 함수를 쓰되, 여기서는 금액을 은행 거래에서 그대로 가져온다(사람이 입력하지 않는다).
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

    const { data: tx } = await db
      .from('bank_transactions')
      .select('id, direction, amount, trdt, posted_at, posted_restaurant_id, depositor_raw, depositor_norm')
      .eq('id', bankTransactionId)
      .maybeSingle()
    if (!tx) return NextResponse.json({ error: '은행 거래를 찾을 수 없습니다.' }, { status: 404 })
    if (tx.direction !== 'in') return NextResponse.json({ error: '입금이 아닌 거래는 확정할 수 없습니다.' }, { status: 400 })

    // 이미 다른 업체로 반영된 거래는 자동으로 바꾸지 않는다(2026-09-26 리뷰 지적). 같은 업체로 다시 누른 건
    // 중복 클릭으로 보고 성공으로 응답한다 — record_receivable_payment 도 already_posted 로 아무것도 안 바꾼다.
    if (tx.posted_at && tx.posted_restaurant_id !== restaurantId) {
      return NextResponse.json({ error: '이미 다른 업체의 입금으로 반영된 거래입니다.' }, { status: 409 })
    }

    const { data, error } = await db.rpc('record_receivable_payment', {
      p_restaurant_id: restaurantId,
      p_amount: tx.amount,
      p_method: 'transfer',
      p_paid_at: tx.trdt,
      p_created_by: user.id,
      p_bank_transaction_id: bankTransactionId,
    })

    if (error) {
      if (error.message === 'NO_RECEIVABLES') {
        return NextResponse.json({ error: '이 업체는 미수금 내역이 없습니다.' }, { status: 404 })
      }
      if (error.message === 'OVERPAY') {
        const totalOutstanding = Number(error.details ?? 0)
        return NextResponse.json({
          error: `이 업체의 미수금은 ${won(totalOutstanding)}원인데 입금액은 ${won(tx.amount)}원입니다. 업체를 다시 확인해 주세요.`,
        }, { status: 400 })
      }
      console.error('[confirm-bank-transaction] rpc error', error)
      return NextResponse.json({ error: '입금 확정 실패' }, { status: 500 })
    }

    // 처음 확정될 때(중복 클릭이 아닐 때)만 입금자명을 업체 별칭으로 남긴다. 「업체 선택」과 「입금자 별칭」
    // 이 서로 안 맞는다는 지적(2026-09-29)에 대한 조치 — 확정하면서 고른 업체를 그대로 별칭으로 삼아,
    // 다음번 같은 이름 입금부터는 자동 추천되게 한다. 실패해도 확정 자체는 이미 끝난 뒤라 무시한다
    // (이미 등록된 별칭이면 unique 제약에 걸리는데, 그것도 정상 — 조용히 넘어간다).
    if (!data?.already_posted) {
      const alias = normalizeDepositor(tx.depositor_raw)
      if (alias) {
        const { error: aliasError } = await db
          .from('depositor_aliases')
          .insert({ restaurant_id: restaurantId, alias_raw: tx.depositor_raw, alias_norm: alias, created_by: user.id })
        if (aliasError && aliasError.code !== '23505' && !/duplicate key/.test(aliasError.message ?? '')) {
          console.error('[confirm-bank-transaction] 별칭 자동 등록 실패', aliasError)
        }
      }
    }

    return NextResponse.json({
      success: true,
      applied: data?.applied ?? 0,
      updatedCount: data?.updated_count ?? 0,
      alreadyPosted: Boolean(data?.already_posted),
    })
  } catch (e) {
    console.error('[confirm-bank-transaction] unexpected error', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
