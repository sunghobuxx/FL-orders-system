export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { computeOutstanding, syncStatementFinance } from '@/lib/settlement-finance'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

// 개별 발주 품목 삭제 (수량/단가 수정 후 cascade)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const itemId = searchParams.get('itemId')
    if (!itemId) return NextResponse.json({ error: 'itemId 누락' }, { status: 400 })

    const { user, supabase: db } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const adminDb = createAdminClient()

    // 연결된 daily_spec_lines 찾기 (삭제 전에)
    const { data: specLines } = await db
      .from('daily_spec_lines')
      .select('id, daily_spec_id')
      .eq('order_item_id', itemId)

    // dispatch_job_items FK 먼저 삭제
    await db.from('dispatch_job_items').delete().eq('order_item_id', itemId)

    // daily_spec_lines 삭제 (해당 order_item과 연결된 것)
    if (specLines?.length) {
      for (const sl of specLines) {
        await db.from('daily_spec_lines').delete().eq('id', sl.id)
      }
    }

    // order_item 삭제
    const { error } = await db.from('order_items').delete().eq('id', itemId)
    if (error) throw error

    // 영향받은 daily_specs 합계 재계산 → cascade
    const affectedSpecIds = [...new Set((specLines ?? []).map(sl => sl.daily_spec_id))]
    for (const specId of affectedSpecIds) {
      const { data: allLines } = await db
        .from('daily_spec_lines')
        .select('amount, vat_amount')
        .eq('daily_spec_id', specId)

      const newSpecTotal = (allLines ?? []).reduce(
        (s, l) => s + Number(l.amount ?? 0) + Number(l.vat_amount ?? 0),
        0,
      )
      const newSpecVat = (allLines ?? []).reduce((s, l) => s + Number(l.vat_amount ?? 0), 0)

      await db
        .from('daily_specs')
        .update({ total_amount: newSpecTotal, vat_amount: newSpecVat })
        .eq('id', specId)

      const { data: stmtLines } = await adminDb
        .from('sales_statement_lines')
        .select('id, sales_statement_id')
        .eq('source_doc_type', 'daily_spec')
        .eq('source_doc_id', specId)

      for (const stmtLine of stmtLines ?? []) {
        await adminDb
          .from('sales_statement_lines')
          .update({ amount: newSpecTotal })
          .eq('id', stmtLine.id)

        const { data: linesOfStmt } = await adminDb
          .from('sales_statement_lines')
          .select('amount')
          .eq('sales_statement_id', stmtLine.sales_statement_id)
        const newStmtTotal = (linesOfStmt ?? []).reduce(
          (s, l) => s + Number(l.amount ?? 0),
          0,
        )

        const outstanding = await computeOutstanding(stmtLine.sales_statement_id, newStmtTotal)
        await syncStatementFinance(stmtLine.sales_statement_id, newStmtTotal, outstanding)
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[DELETE /api/admin/orders/items]', e)
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  }
}
