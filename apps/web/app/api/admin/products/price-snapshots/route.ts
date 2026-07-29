export const runtime = 'edge'

import { computeOutstanding, syncStatementFinance } from '@/lib/settlement-finance'
import { NextResponse } from 'next/server'
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

    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    // 데이터 작업은 service role 로 한다. 세션(RLS)으로 쓰면 막혀도 에러가 안 나
    // 조용히 실패하거나 조회가 null 이 되어 엉뚱한 404 가 난다.
    const db = createAdminClient()
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

    // 2. effective_from 이후 daily_spec_lines 단가 자동 업데이트
    // price_overridden=false인 라인만 업데이트 (수동 입력 단가는 유지)
    //
    // 이미 정산서로 청구된 명세서는 제외한다.
    // 여기서 과거 명세서를 다시 계산해도 정산서 청구액은 따라오지 않아서,
    // 단가를 등록할 때마다 "명세서 ≠ 청구액" 이 새로 생겼다.
    // 받은 돈은 그때 청구한 금액이므로 지난 청구를 소급해 바꾸면 안 된다.
    const { data: allSpecs } = await adminDb
      .from('daily_specs')
      .select('id')
      .gte('business_date', body.effective_from)

    const { data: billedLines } = allSpecs?.length
      ? await adminDb
          .from('sales_statement_lines')
          .select('source_doc_id')
          .eq('source_doc_type', 'daily_spec')
          .in('source_doc_id', allSpecs.map((s: { id: string }) => s.id))
      : { data: [] as { source_doc_id: string }[] }

    const billedSet = new Set((billedLines ?? []).map((l: { source_doc_id: string }) => l.source_doc_id))
    const specs = (allSpecs ?? []).filter((s: { id: string }) => !billedSet.has(s.id))

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
