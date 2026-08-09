export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const { restaurantId, amount, method } = await req.json() as {
      restaurantId: string
      amount: number
      method: string
    }

    if (!restaurantId) return NextResponse.json({ error: '업체 정보가 없습니다.' }, { status: 400 })
    if (!amount || amount <= 0) return NextResponse.json({ error: '금액을 입력하세요.' }, { status: 400 })

    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const db = createAdminClient()

    // 미납 receivable 전체를 due_date 오름차순으로 조회 (statement_id 포함)
    const { data: receivables } = await db
      .from('receivables')
      .select('id, balance, statement_id')
      .eq('restaurant_id', restaurantId)
      .in('status', ['unpaid', 'partial', 'overdue'])
      .order('due_date', { ascending: true })

    if (!receivables || receivables.length === 0) {
      return NextResponse.json({ error: '미수금 내역이 없습니다.' }, { status: 404 })
    }

    // 미수금보다 많이 들어온 돈은 받지 않는다.
    //
    // 예전에는 붙일 곳이 없는 초과분을 응답에만 leftover 로 담고 그냥 버렸다.
    // 화면은 그 값을 쓰지 않았으므로 「102,000원 입금 처리 완료」만 뜨고 나머지는
    // 사라졌다 — 2026-07-27 만나웰빙한식부페에서 171,600 중 69,600 이 그렇게 없어졌다.
    // 그 주 정산서의 미수금 행이 다음 날에야 생겼기 때문이다.
    //
    // 선수금을 담아 둘 자리가 아직 없으므로, 조용히 버리는 대신 막고 알린다.
    const totalOutstanding = receivables.reduce((s, r) => s + Number(r.balance ?? 0), 0)
    if (amount > totalOutstanding) {
      const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
      return NextResponse.json({
        error:
          `현재 미수금은 ${won(totalOutstanding)}원인데 ${won(amount)}원이 입력됐습니다. ` +
          `${won(amount - totalOutstanding)}원은 붙일 곳이 없어 기록되지 않습니다.\n\n` +
          `아직 정산서가 안 만들어진 기간의 대금이면, 그 정산서가 생긴 뒤에 입력해 주세요. ` +
          `지금 넣으시려면 ${won(totalOutstanding)}원까지만 됩니다.`,
      }, { status: 400 })
    }

    // 입금액을 순서대로 각 receivable에 적용 (오래된 것부터)
    let remaining = amount
    const toUpdate: { id: string; newBalance: number; status: string; applied: number; statement_id: string | null }[] = []

    for (const rv of receivables) {
      if (remaining <= 0) break
      const bal = Number(rv.balance)
      const applied = Math.min(remaining, bal)
      remaining -= applied
      toUpdate.push({
        id: rv.id,
        newBalance: bal - applied,
        status: (bal - applied) === 0 ? 'paid' : 'partial',
        applied,
        statement_id: rv.statement_id,
      })
    }

    // payments 테이블에 각 receivable별로 적용금액 기록
    const paymentRows = toUpdate.map(u => ({
      target_type: 'receivable',
      target_id: u.id,
      amount: u.applied,
      direction: 'inbound',
      method: method || 'cash',
      paid_at: new Date().toISOString(),
    }))
    const { error: payErr } = await db.from('payments').insert(paymentRows)
    if (payErr) {
      console.error('[record-payment] insert payments error', payErr)
      return NextResponse.json({ error: '입금 기록 실패' }, { status: 500 })
    }

    // receivables balance/status 업데이트
    for (const u of toUpdate) {
      await db.from('receivables').update({
        balance: u.newBalance,
        status: u.status,
      }).eq('id', u.id)
    }

    // sales_statements.outstanding_amount 도 반영
    // 영향받은 statement_id 목록
    const stmtIds = [...new Set(toUpdate.map(u => u.statement_id).filter(Boolean) as string[])]
    for (const stmtId of stmtIds) {
      // 해당 정산서의 모든 receivable 잔액 합산
      const { data: allRecvs } = await db
        .from('receivables')
        .select('balance')
        .eq('statement_id', stmtId)
      const newOutstanding = (allRecvs ?? []).reduce((s, r) => s + Number(r.balance), 0)
      await db
        .from('sales_statements')
        .update({ outstanding_amount: newOutstanding })
        .eq('id', stmtId)
    }

    // 위에서 초과분을 막았으므로 remaining 은 0 이어야 한다. 0 이 아니면 계산이 어긋난 것이다.
    if (remaining > 0) {
      console.error('[record-payment] 붙이지 못한 금액이 남았다', { restaurantId, amount, remaining })
    }

    return NextResponse.json({
      success: true,
      applied: amount - remaining,
      leftover: remaining,
      updatedCount: toUpdate.length,
    })
  } catch (e) {
    console.error('[record-payment] unexpected error', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
