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
