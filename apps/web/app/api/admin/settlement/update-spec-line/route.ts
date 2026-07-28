export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { computeOutstanding, syncStatementFinance } from '@/lib/settlement-finance'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

interface LineUpdate {
  id: string          // daily_spec_lines.id
  qty: number
  unit_price: number
}

function getWriteClient(fallback: ReturnType<typeof createAdminClient>) {
  try {
    return createAdminClient()
  } catch {
    return fallback
  }
}

/**
 * 어드민 명세서 상세에서 라인별 수량/단가 수정.
 * 매출(daily_specs → sales_statements → receivables) 과
 * 매입(order_items 실시간 집계) 모두에 반영되도록 cascade.
 */
export async function POST(req: NextRequest) {
  try {
    const { specId, lines }: { specId: string; lines: LineUpdate[] } = await req.json()
    if (!specId || !lines?.length) {
      return NextResponse.json({ error: '필수 값 누락' }, { status: 400 })
    }

    const { user, supabase: db } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const writeDb = getWriteClient(db as unknown as ReturnType<typeof createAdminClient>)

    // 1) daily_specs 존재 확인 + 이전 total 백업
    const { data: spec } = await db
      .from('daily_specs')
      .select('id, total_amount')
      .eq('id', specId)
      .single()
    if (!spec) return NextResponse.json({ error: '명세서를 찾을 수 없습니다' }, { status: 404 })



    // 2) 현재 라인 메타 (order_item_id 매핑)
    const lineIds = lines.map(l => l.id)
    const { data: existingLines } = await db
      .from('daily_spec_lines')
      .select('id, product_id, order_item_id')
      .in('id', lineIds)

    const metaById = new Map<string, { product_id: string; order_item_id: string | null }>()
    for (const l of existingLines ?? []) {
      metaById.set(l.id, {
        product_id: l.product_id,
        order_item_id: l.order_item_id,
      })
    }

    // products.taxable_flag 조회 (vat_amount 기준 추정 → 품목마스터 기준으로 변경)
    const productIds = [...new Set((existingLines ?? []).map(l => l.product_id))]
    const { data: productRows } = await db
      .from('products').select('id, taxable_flag').in('id', productIds)
    const taxableMap = Object.fromEntries((productRows ?? []).map(p => [p.id, p.taxable_flag ?? false]))

    // 3) 각 라인: daily_spec_lines 갱신 + 매칭 order_items 도 갱신
    for (const upd of lines) {
      if (upd.qty <= 0) continue
      const meta = metaById.get(upd.id)
      if (!meta) continue

      const isTaxable = taxableMap[meta.product_id] ?? false
      const newAmount = upd.qty * upd.unit_price
      const newVat = isTaxable ? Math.round(newAmount * 0.1) : 0

      // amount는 generated column (qty * unit_price 자동계산) → 직접 업데이트 불가
      const { error: lineError } = await db
        .from('daily_spec_lines')
        .update({ qty: upd.qty, unit_price: upd.unit_price, vat_amount: newVat, price_overridden: true })
        .eq('id', upd.id)
        .eq('daily_spec_id', specId)

      if (lineError) throw lineError

      // 매입 집계는 order_items.qty * unit_price_snapshot 으로 계산되므로 같이 갱신
      if (meta.order_item_id) {
        const { error: orderItemError } = await writeDb
          .from('order_items')
          .update({ qty: upd.qty, unit_price_snapshot: upd.unit_price })
          .eq('id', meta.order_item_id)

        if (orderItemError) throw orderItemError
      }
    }

    const { data: savedLines, error: savedLinesError } = await db
      .from('daily_spec_lines')
      .select('id, unit_price')
      .in('id', lineIds)
      .eq('daily_spec_id', specId)

    if (savedLinesError) throw savedLinesError

    const savedPriceById = new Map((savedLines ?? []).map(line => [line.id, Number(line.unit_price)]))
    for (const line of lines) {
      if (savedPriceById.get(line.id) !== Number(line.unit_price)) {
        throw new Error('단가 저장 확인 실패')
      }
    }

    // 4) daily_specs 합계 재계산
    const { data: allLines } = await db
      .from('daily_spec_lines')
      .select('amount, vat_amount')
      .eq('daily_spec_id', specId)

    const newSpecTotal = (allLines ?? []).reduce(
      (s, l) => s + Number(l.amount ?? 0) + Number(l.vat_amount ?? 0),
      0,
    )
    const newSpecVat = (allLines ?? []).reduce((s, l) => s + Number(l.vat_amount ?? 0), 0)

    const { error: specUpdateError } = await db
      .from('daily_specs')
      .update({ total_amount: newSpecTotal, vat_amount: newSpecVat })
      .eq('id', specId)
    if (specUpdateError) throw specUpdateError

    // 5) 이 daily_spec 이 포함된 sales_statements 가 있다면 cascade (ground-truth 방식)
    const { data: stmtLines } = await writeDb
      .from('sales_statement_lines')
      .select('id, sales_statement_id')
      .eq('source_doc_type', 'daily_spec')
      .eq('source_doc_id', specId)

    for (const stmtLine of stmtLines ?? []) {
      const { error: stmtLineError } = await writeDb
        .from('sales_statement_lines')
        .update({ amount: newSpecTotal })
        .eq('id', stmtLine.id)
      if (stmtLineError) throw stmtLineError

      const { data: linesOfStmt } = await writeDb
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

    return NextResponse.json({ success: true, totalAmount: newSpecTotal })
  } catch (e) {
    console.error('[POST /api/admin/settlement/update-spec-line]', e)
    return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  }
}
