export const runtime = 'edge'

import { computeOutstanding, syncStatementFinance } from '@/lib/settlement-finance'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      productId: string; supplierProductId: string
      sale_price: number; purchase_price: number; unit: string; effective_from: string
    }
    if (!body.sale_price || !body.unit || !body.effective_from)
      return Response.json({ error: '필수 항목 누락' }, { status: 400 })

    const { supabase: db } = await getSessionUser()
    const { error } = await db.from('price_snapshots').insert({
      supplier_product_id: body.supplierProductId,
      sale_price: body.sale_price, purchase_price: body.purchase_price,
      unit: body.unit, effective_from: body.effective_from,
    })
    if (error) return Response.json({ error: error.message }, { status: 500 })

    const adminDb = createAdminClient()

    // 1. 미완료 발주 아이템 단가 자동 갱신 (effective_from 이후 날짜)
    const { data: batches } = await adminDb
      .from('order_batches')
      .select('id')
      .gte('business_date', body.effective_from)
      .in('status', ['open', 'submitted', 'validated', 'ordered'])

    if (batches?.length) {
      const batchIds = batches.map(b => b.id)
      const { data: orderRows } = await adminDb
        .from('orders')
        .select('id')
        .in('batch_id', batchIds)

      const orderIds = (orderRows ?? []).map(o => o.id)
      if (orderIds.length) {
        await adminDb
          .from('order_items')
          .update({ unit_price_snapshot: body.sale_price })
          .in('order_id', orderIds)
          .eq('supplier_product_id', body.supplierProductId)
      }
    }

    // 2. effective_from 이후 모든 daily_spec_lines 단가 자동 업데이트
    // price_overridden=false인 라인만 업데이트 (수동 입력 단가는 유지)
    const { data: specs } = await adminDb
      .from('daily_specs')
      .select('id')
      .gte('business_date', body.effective_from)

    if (specs?.length) {
      // 품목 과세 여부 조회 (vat_amount 재계산용)
      const { data: productMeta } = await adminDb
        .from('products').select('taxable_flag').eq('id', body.productId).single()
      const taxable = productMeta?.taxable_flag ?? false

      const specIds = specs.map(s => s.id)
      const { data: specLines } = await adminDb
        .from('daily_spec_lines')
        .select('id, daily_spec_id, qty')
        .in('daily_spec_id', specIds)
        .eq('price_overridden', false)
        .eq('product_id', body.productId)

      // unit_price + vat_amount 동시 업데이트
      for (const line of specLines ?? []) {
        const newVat = taxable ? Math.round(Number(line.qty) * body.sale_price * 0.1) : 0
        await adminDb
          .from('daily_spec_lines')
          .update({ unit_price: body.sale_price, vat_amount: newVat })
          .eq('id', line.id)
      }

      // 영향받는 각 spec 합계 재계산 → statement cascade (recalculate-spec과 동일 방식)
      const affectedSpecIds = [...new Set((specLines ?? []).map(l => l.daily_spec_id))]
      for (const specId of affectedSpecIds) {
        const { data: allLines } = await adminDb
          .from('daily_spec_lines')
          .select('amount, vat_amount')
          .eq('daily_spec_id', specId)

        const newSpecTotal = (allLines ?? []).reduce(
          (s, l) => s + Number(l.amount ?? 0) + Number(l.vat_amount ?? 0), 0
        )
        const newSpecVat = (allLines ?? []).reduce((s, l) => s + Number(l.vat_amount ?? 0), 0)

        await adminDb
          .from('daily_specs')
          .update({ total_amount: newSpecTotal, vat_amount: newSpecVat })
          .eq('id', specId)

        // statement_lines cascade (ground-truth 방식)
        const { data: stmtLines } = await adminDb
          .from('sales_statement_lines')
          .select('id, sales_statement_id')
          .eq('source_doc_type', 'daily_spec')
          .eq('source_doc_id', specId)

        for (const stmtLine of stmtLines ?? []) {
          await adminDb.from('sales_statement_lines')
            .update({ amount: newSpecTotal }).eq('id', stmtLine.id)

          const { data: linesOfStmt } = await adminDb
            .from('sales_statement_lines').select('amount')
            .eq('sales_statement_id', stmtLine.sales_statement_id)
          const newStmtTotal = (linesOfStmt ?? []).reduce(
            (s, l) => s + Number(l.amount ?? 0), 0
          )

          const outstanding = await computeOutstanding(stmtLine.sales_statement_id, newStmtTotal)
          await syncStatementFinance(stmtLine.sales_statement_id, newStmtTotal, outstanding)
        }
      }
    }

    return Response.json({ ok: true })
  } catch (e) { return Response.json({ error: String(e) }, { status: 500 }) }
}
