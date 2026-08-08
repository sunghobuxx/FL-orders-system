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

    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    // 데이터 작업은 service role 로. 세션(RLS)으로 쓰면 막혀도 에러가 안 나거나
    // 정책이 없으면 통째로 실패한다 (restaurant_products 는 service_role 쓰기만 허용).
    const db = createAdminClient()
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

/**
 * 발주 문자에 나갈 수량만 바꾼다.
 *
 * order_items 를 고치면 명세서·정산까지 따라 바뀐다. 여기서 바꾸는 건
 * dispatch_job_items 뿐이라 문자에만 반영되고 청구 금액은 그대로다.
 *
 * qty_overridden 을 세워 두면 발송 직전 syncDispatchJobItems 가
 * 이 줄의 수량을 발주 수량으로 되돌리지 않는다.
 * qty 를 null 로 보내면 수정을 취소하고 발주 수량으로 돌아간다.
 *
 * (예전에는 Cloudflare Worker 3 MiB 한계 때문에 라우트를 못 늘렸다. 유료 전환으로
 * 풀렸으니 새 기능은 라우트를 따로 만들어도 된다.)
 */
export async function PATCH(req: NextRequest) {
  try {
    const { itemId, qty } = await req.json() as { itemId?: string; qty?: number | null }

    if (!itemId) {
      return NextResponse.json({ error: '필수 값 누락 (itemId)' }, { status: 400 })
    }
    if (qty !== null && (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 0)) {
      return NextResponse.json({ error: '수량은 0 이상의 숫자여야 합니다' }, { status: 400 })
    }

    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

    const db = createAdminClient()

    const { data: row, error: readError } = await db
      .from('dispatch_job_items')
      .select('id, qty, order_items(qty)')
      .eq('id', itemId)
      .maybeSingle()

    if (readError) throw readError
    if (!row) return NextResponse.json({ error: '발주 품목을 찾을 수 없습니다' }, { status: 404 })

    const orderQty = Number((row.order_items as unknown as { qty: number } | null)?.qty ?? row.qty)

    // 0 은 "이 업체 것은 빼고 보낸다" 는 뜻이다.
    // dispatch_job_items_qty_check 가 0 을 막으므로 수량은 그대로 두고 is_excluded 로 뺀다.
    const next = qty === null
      ? { qty: orderQty, qty_overridden: false, is_excluded: false }
      : qty === 0
        ? { qty_overridden: true, is_excluded: true }
        : { qty, qty_overridden: true, is_excluded: false }

    const { error } = await db.from('dispatch_job_items').update(next).eq('id', itemId)
    if (error) throw error

    return NextResponse.json({
      success: true,
      qty: qty === 0 ? 0 : ('qty' in next ? next.qty : orderQty),
      overridden: next.qty_overridden,
      excluded: Boolean(next.is_excluded),
    })
  } catch (e) {
    console.error('[PATCH /api/admin/orders/items]', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
