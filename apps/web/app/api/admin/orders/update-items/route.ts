export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { computeOutstanding, syncStatementFinance } from '@/lib/settlement-finance'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminSession } from '@/lib/admin-member-user'
import { splitVat } from '@/lib/specs/vat'

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

    // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user } = session
    // 데이터 작업은 service role 로. 세션(RLS)으로 쓰면 막혀도 에러가 안 나거나
    // 정책이 없으면 통째로 실패한다 (restaurant_products 는 service_role 쓰기만 허용).
    const db = createAdminClient()
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
        .select('id, daily_spec_id, product_id, unit_price, price_overridden')
        .eq('order_item_id', item.id)

      for (const specLine of specLines ?? []) {
        // products.taxable_flag 조회
        const { data: product } = await db
          .from('products')
          .select('taxable_flag')
          .eq('id', specLine.product_id)
          .single()
        const isTaxable = product?.taxable_flag ?? false
      // 단가는 부가세 포함 금액이다. 위에 얹지 않고 그 안에서 나눈다.
        const split = splitVat(isTaxable, item.qty, item.unit_price_snapshot)

        // price_overridden 은 "단가를 손으로 지정했다" 는 표시다.
        // 예전에는 수량만 고쳐도 무조건 true 를 박았다. 그러면 그 줄이 단가 자동 반영
        // 대상에서 빠져, 나중에 단가를 새로 등록해도 값이 옛것으로 남았다.
        // (2026-08-01 기준 그 주 명세서 라인의 27% 가 이 상태였다)
        // 수량만 바뀐 경우는 order_items.qty 도 같이 바뀌므로, 나중에 명세서를
        // 재동기화해도 같은 수량이 나온다. 표시를 붙이지 않아도 값이 되돌아가지 않는다.
        const priceChanged =
          Math.abs(Number(specLine.unit_price ?? 0) - Number(item.unit_price_snapshot)) > 0.5
        const nextOverridden = Boolean(specLine.price_overridden) || priceChanged

        await db
          .from('daily_spec_lines')
          .update({ qty: item.qty, unit_price: split.unitPrice, vat_amount: split.vat, price_overridden: nextOverridden })
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
