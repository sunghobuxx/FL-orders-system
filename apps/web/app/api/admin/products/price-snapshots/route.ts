export const runtime = 'edge'

import { computeOutstanding, syncStatementFinance } from '@/lib/settlement-finance'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminSession } from '@/lib/admin-member-user'
import { splitVat } from '@/lib/specs/vat'

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      productId: string; supplierProductId: string
      sale_price: number; purchase_price: number; unit: string; effective_from: string
    }
    if (!body.sale_price || !body.unit || !body.effective_from)
      return Response.json({ error: '필수 항목 누락' }, { status: 400 })

    // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user } = session
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

    // 1. 발주 아이템 단가 자동 갱신 (effective_from 이후 날짜)
    //
    // 예전에는 open/submitted/validated/ordered 만 갱신해서, 발주 문자가 나간 뒤
    // (dispatched) 부터는 단가를 등록해도 발주서에 하나도 반영되지 않았다.
    // 2026-08-01 기준 그 주 배치 85개가 전부 dispatched 였다.
    // effective_from 이후로만 바꾸므로 과거 발주를 소급해 흔들지 않는다.
    const { data: batches } = await adminDb
      .from('order_batches')
      .select('id')
      .gte('business_date', body.effective_from)
      .in('status', ['open', 'submitted', 'validated', 'ordered', 'dispatched', 'completed'])

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

        // supplier_product_id 가 비어 있는 줄도 있다(2026-08-01 기준 5%).
        // 그 줄은 품목으로 찾아 갱신한다. 안 그러면 같은 품목인데 단가만 옛것으로 남는다.
        await adminDb
          .from('order_items')
          .update({ unit_price_snapshot: body.sale_price })
          .in('order_id', orderIds)
          .is('supplier_product_id', null)
          .eq('product_id', body.productId)
      }
    }

    // 2. effective_from 이후 daily_spec_lines 단가 자동 업데이트
    // price_overridden=false인 라인만 업데이트 (수동 입력 단가는 유지)
    //
    // 완납된 정산서에 들어간 명세서만 제외한다.
    // 받은 돈은 그때 청구한 금액이므로 지난 청구를 소급해 바꾸면 안 된다.
    //
    // 예전에는 "정산서에 들어갔으면" 전부 제외했다. 그때는 정산서가 기간이 끝나야
    // 만들어져서 그 기준이 통했다. 2026-08-01 부터 매일 04:00 크론이 진행 중인 주도
    // 정산서에 넣기 시작하면서, 오늘 명세서까지 전부 제외 대상이 되어
    // 단가를 등록해도 명세서에 반영되지 않았다.
    // 미납 정산서는 아래 cascade 가 청구액까지 같이 고치므로 제외할 이유가 없다.
    const { data: allSpecs } = await adminDb
      .from('daily_specs')
      .select('id')
      .gte('business_date', body.effective_from)

    const { data: billedLines } = allSpecs?.length
      ? await adminDb
          .from('sales_statement_lines')
          .select('source_doc_id, sales_statement_id')
          .eq('source_doc_type', 'daily_spec')
          .in('source_doc_id', allSpecs.map((s: { id: string }) => s.id))
      : { data: [] as { source_doc_id: string }[] }

    const stmtIdsOfSpec = new Map<string, string[]>()
    for (const l of (billedLines ?? []) as { source_doc_id: string; sales_statement_id: string }[]) {
      const arr = stmtIdsOfSpec.get(l.source_doc_id)
      if (arr) arr.push(l.sales_statement_id)
      else stmtIdsOfSpec.set(l.source_doc_id, [l.sales_statement_id])
    }

    const allStmtIds = [...new Set([...stmtIdsOfSpec.values()].flat())]
    const { data: recvRows } = allStmtIds.length
      ? await adminDb.from('receivables').select('statement_id, status').in('statement_id', allStmtIds)
      : { data: [] as { statement_id: string; status: string }[] }

    const recvByStmt = new Map<string, string[]>()
    for (const r of (recvRows ?? []) as { statement_id: string; status: string }[]) {
      const arr = recvByStmt.get(r.statement_id)
      if (arr) arr.push(r.status)
      else recvByStmt.set(r.statement_id, [r.status])
    }
    const isSettled = (stmtId: string) => {
      const st = recvByStmt.get(stmtId) ?? []
      return st.length > 0 && st.every(x => x === 'paid')
    }

    const settledSet = new Set(
      [...stmtIdsOfSpec.entries()]
        .filter(([, ids]) => ids.some(isSettled))
        .map(([specId]) => specId)
    )
    const specs = (allSpecs ?? []).filter((s: { id: string }) => !settledSet.has(s.id))

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
        // 단가는 부가세 포함 금액이다. 위에 얹지 않고 그 안에서 나눈다.
        const split = splitVat(taxable, Number(line.qty), body.sale_price)
        await adminDb
          .from('daily_spec_lines')
          .update({ unit_price: split.unitPrice, vat_amount: split.vat })
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
