export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-member-user'

/**
 * 「입금 확인」 목록에서 은행 거래 하나를 건너뛴다 — 돈은 움직이지 않는다.
 *
 * 계좌조회가 지난 며칠치를 가져오면서, 사장님이 그 전에 이미 손으로 입력해 둔 입금과 겹치는 경우가
 * 있다(2026-09-29: 중랑점 등 여러 건 확인). 그 경우 [확정] 을 누르면 미수금보다 많다고 막히는데,
 * 이미 반영된 돈이라 막히는 게 맞다 — 다시 넣을 수는 없고, 목록에서만 치워야 한다.
 * `posted_restaurant_id` 를 비워 둔 채 `posted_at` 만 찍어 "확정" 과 구분한다.
 */
export async function POST(req: Request) {
  try {
    const { bankTransactionId } = await req.json() as { bankTransactionId?: string }
    if (!bankTransactionId) return NextResponse.json({ error: '필수 값이 없습니다.' }, { status: 400 })

    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user, db } = session

    const { data: tx } = await db
      .from('bank_transactions')
      .select('id, direction, posted_at')
      .eq('id', bankTransactionId)
      .maybeSingle()
    if (!tx) return NextResponse.json({ error: '은행 거래를 찾을 수 없습니다.' }, { status: 404 })
    if (tx.direction !== 'in') return NextResponse.json({ error: '입금이 아닌 거래는 건너뛸 필요가 없습니다.' }, { status: 400 })

    // 이미 확정됐거나 건너뛴 거래는 다시 쓰지 않는다(중복 클릭 방지). 그대로 성공으로 응답한다.
    if (!tx.posted_at) {
      const { error } = await db
        .from('bank_transactions')
        .update({ posted_at: new Date().toISOString(), posted_restaurant_id: null, posted_by: user.id })
        .eq('id', bankTransactionId)
      if (error) {
        console.error('[dismiss-bank-transaction] update error', error)
        return NextResponse.json({ error: '처리 실패' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[dismiss-bank-transaction] unexpected error', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
