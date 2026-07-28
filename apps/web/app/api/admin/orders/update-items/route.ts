export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { computeOutstanding, syncStatementFinance } from '@/lib/settlement-finance'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

interface ItemUpdate {
  id: string
  qty: number
  unit_price_snapshot: number
}

export async function POST(req: NextRequest) {
  try {
    const { batchId, items }: { batchId: string; items: ItemUpdate[] } = await req.json()
    if (!batchId || !items?.length) {
      return NextResponse.json({ error: '필수 값 누락' }, { status: 400 })
    }

    const { user, supabase: db } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const adminDb = createAdminClient()

    for (const item of items) {
      if (item.qty <= 0) continue

      // order_items 업데이트
      const { error: itemErr } = await db
        .from('order_items')
        .update({ qty: item.qty, unit_price_snapshot: item.unit_price_snapshot })
        .eq('id', item.id)
      if (itemErr) throw itemErr

      // 연결된 daily_spec_line도 함께 업데이트
      const { data: specLines } = await db
        .from('daily_spec_lines')
        .select('id, daily_spec_id, product_id')
        .eq('order_item_id', item.id)

      for (const specLine of specLines ?? []) {
        // products.taxable_flag 조회
        const { data: product } = await db
          .from('products')
          .select('taxable_flag')
          .eq('id', specLine.product_id)
          .single()
        const isTaxable = product?.taxable_flag ?? false
        const newVat = isTaxable ? Math.round(item.qty * item.unit_price_snapshot * 0.1) : 0

        await db
          .from('daily_spec_lines')
          .update({ qty: item.qty, unit_price: item.unit_price_snapshot, vat_amount: newVat, price_overridden: true })
          .eq('id', specLine.id)

        // daily_specs 합계 재계산
        const { data: allLines } = await db
          .from('daily_spec_lines')
          .select('amount, vat_amount')
          .eq('daily_spec_id', specLine.daily_spec_id)

        const newSpecTotal = (allLines ?? []).reduce(
          (s, l) => s + Number(l.amount ?? 0) + Number(l.vat_amount ?? 0),
          0,
        )
        const newSpecVat = (allLines ?? []).reduce((s, l) => s + Number(l.vat_amount ?? 0), 0)

        await db
          .from('daily_specs')
          .update({ total_amount: newSpecTotal, vat_amount: newSpecVat })
          .eq('id', specLine.daily_spec_id)

        // sales_statement_lines → sales_statements → receivables 카스케이드
        const { data: stmtLines } = await adminDb
          .from('sales_statement_lines')
          .select('id, sales_statement_id')
          .eq('source_doc_type', 'daily_spec')
          .eq('source_doc_id', specLine.daily_spec_id)

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
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[POST /api/admin/orders/update-items]', e)
    return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  }
}
