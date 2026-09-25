export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-member-user'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

export async function POST(req: Request) {
  try {
    const { restaurantId, amount, method, paidOn } = await req.json() as {
      restaurantId: string
      amount: number
      method: string
      /** 실제 입금일 (YYYY-MM-DD). 없으면 지금 시각으로 기록한다. */
      paidOn?: string
    }

    if (!restaurantId) return NextResponse.json({ error: '업체 정보가 없습니다.' }, { status: 400 })
    if (!amount || amount <= 0) return NextResponse.json({ error: '금액을 입력하세요.' }, { status: 400 })

    // 입금일을 따로 받는다.
    //
    // 예전에는 paid_at 에 입력한 시각을 그대로 박았다. 며칠 지나서 입력하면 통장 날짜와
    // 어긋나 대조가 안 된다 — 찬란한 아구 강남은 월요일에 입금받는데 기록은 화·목·토로
    // 찍혀 있었다(2026-08-10 확인).
    //
    // 날짜만 받고 시각은 KST 09:00 으로 둔다. 자정으로 두면 UTC 로 전날이 되어
    // 날짜별로 묶어 볼 때 하루씩 밀린다.
    const now = new Date()
    const kstToday = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
    let paidAt = now.toISOString()
    if (paidOn) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
        return NextResponse.json({ error: '입금일이 올바르지 않습니다.' }, { status: 400 })
      }
      if (paidOn > kstToday) {
        return NextResponse.json({ error: '입금일을 미래로 넣을 수 없습니다.' }, { status: 400 })
      }
      paidAt = `${paidOn}T09:00:00+09:00`
    }

    // 로그인만 확인하면 회원 계정으로도 남의 업체 입금이 기록된다.
    // 다른 어드민 API 와 같이 관리자 권한까지 본다 (2026-08-10 확인된 구멍).
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user, db } = session

    // 미수금 조회 → payments 기록 → 잔액·정산서 갱신을 DB 함수 한 개(한 트랜잭션, 행 잠금)가 한다.
    // 예전에는 이 라우트가 네 번에 나눠 호출해서 중간에 실패하면 반쯤 반영됐고, 동시에 누르면 같은 미수금을
    // 두 번 갚을 수 있었다. 오래된 미수금부터 채우고, 초과입금은 거절한다(만나웰빙 2026-07-27:
    // 171,600 중 69,600 이 기록 없이 사라졌다). 규칙은 supabase/migrations/20260926010000_record_receivable_payment.sql.
    const { data, error } = await db.rpc('record_receivable_payment', {
      p_restaurant_id: restaurantId,
      p_amount: amount,
      p_method: method || 'cash',
      p_paid_at: paidAt,
      p_created_by: user.id,
      p_bank_transaction_id: null,
    })

    if (error) {
      if (error.message === 'NO_RECEIVABLES') {
        return NextResponse.json({ error: '미수금 내역이 없습니다.' }, { status: 404 })
      }
      if (error.message === 'OVERPAY') {
        // 선수금을 담아 둘 자리가 아직 없으므로, 조용히 버리는 대신 막고 알린다.
        const totalOutstanding = Number(error.details ?? 0)
        return NextResponse.json({
          error:
            `현재 미수금은 ${won(totalOutstanding)}원인데 ${won(amount)}원이 입력됐습니다. ` +
            `${won(amount - totalOutstanding)}원은 붙일 곳이 없어 기록되지 않습니다.\n\n` +
            `아직 정산서가 안 만들어진 기간의 대금이면, 그 정산서가 생긴 뒤에 입력해 주세요. ` +
            `지금 넣으시려면 ${won(totalOutstanding)}원까지만 됩니다.`,
        }, { status: 400 })
      }
      if (error.message === 'INVALID_AMOUNT') {
        // 원 단위 정수만 받는다(소수·NaN·Infinity 는 DB 함수가 거절). 잔액이 어긋나는 것을 막는다.
        return NextResponse.json({ error: '금액이 올바르지 않습니다.' }, { status: 400 })
      }
      if (error.message === 'INVALID_METHOD') {
        return NextResponse.json({ error: '입금 방법이 올바르지 않습니다.' }, { status: 400 })
      }
      console.error('[record-payment] rpc error', error)
      return NextResponse.json({ error: '입금 기록 실패' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      applied: data?.applied ?? 0,
      leftover: data?.leftover ?? 0,
      updatedCount: data?.updated_count ?? 0,
    })
  } catch (e) {
    console.error('[record-payment] unexpected error', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
