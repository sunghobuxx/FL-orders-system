export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { computeOutstanding, syncStatementFinance } from '@/lib/settlement-finance'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminSession } from '@/lib/admin-member-user'
import { splitVat } from '@/lib/specs/vat'
import { buildPriceMapByProduct } from '@/lib/specs/sync'
import { normalizeUnit } from '@/lib/units'

export async function POST(req: Request) {
  try {
    const { specId } = await req.json() as { specId: string }
    if (!specId) return NextResponse.json({ error: 'specId 누락' }, { status: 400 })

    // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user } = session
    // 데이터 작업은 service role 로. 세션(RLS)으로 쓰면 막혀도 에러가 안 나거나
    // 정책이 없으면 통째로 실패한다 (restaurant_products 는 service_role 쓰기만 허용).
    const db = createAdminClient()

    const { data: spec } = await db
      .from('daily_specs').select('id, business_date, restaurant_id, total_amount').eq('id', specId).single()
    if (!spec) return NextResponse.json({ error: '명세서를 찾을 수 없습니다.' }, { status: 404 })

    const { data: lines } = await db
      .from('daily_spec_lines').select('id, product_id, qty, unit, vat_amount, price_overridden, unit_price').eq('daily_spec_id', specId)
    if (!lines?.length) return NextResponse.json({ error: '명세서 라인이 없습니다.' }, { status: 400 })

    // 단가는 명세서 생성과 **같은 함수**로 찾는다.
    //
    // 예전에는 이 라우트가 price_snapshots 를 직접 뒤졌는데 `unit` 을 보지 않았다.
    // 그래서 다단위 품목에 다른 단위 단가가 붙었다 — 2026-09-12 맛승 부천 명세서에서
    // 백오이 5개에 박스 단가 65,000 이 붙어 325,000 원이 될 뻔했다(정상 7,500).
    // 규칙이 두 벌이면 반드시 갈라진다. 한 곳만 둔다.
    const productIds = [...new Set(lines.map(l => l.product_id))]

    // 그 품목을 어느 단위로 받았는지. 한 품목이 두 단위면 첫 줄을 쓴다 —
    // 그런 날은 어차피 줄마다 손으로 단가를 맞추게 된다.
    const unitOf: Record<string, string> = {}
    for (const l of lines as Array<{ product_id: string; unit: string | null }>) {
      const u = normalizeUnit(l.unit)
      if (u && unitOf[l.product_id] === undefined) unitOf[l.product_id] = u
    }

    const { data: rest } = await db
      .from('restaurants').select('organization_id').eq('id', spec.restaurant_id).maybeSingle()

    const { priceMap } = await buildPriceMapByProduct(
      db, productIds, spec.business_date, rest?.organization_id ?? null, unitOf)

    const { data: productsMeta } = await db
      .from('products').select('id, taxable_flag').in('id', productIds)
    const taxableMap = Object.fromEntries(
      (productsMeta ?? []).map(p => [p.id, p.taxable_flag ?? false])
    )

    // spec_lines 업데이트: price_overridden=true인 라인은 수동 단가 유지
    let totalAmount = 0
    let totalVat = 0
    for (const line of lines) {
      // 우선순위 1: 명세서에서 수동 입력된 단가 → 그대로 유지
      const unitPrice = line.price_overridden
        ? Number(line.unit_price)
        : (priceMap[line.product_id] ?? Number(line.unit_price))

      // 단가는 부가세 포함 금액이다. 위에 얹지 않고 그 안에서 나눈다.
      const split = splitVat(Boolean(taxableMap[line.product_id]), Number(line.qty), unitPrice)
      totalAmount += split.gross
      totalVat += split.vat

      if (!line.price_overridden) {
        await db.from('daily_spec_lines')
          .update({ unit_price: split.unitPrice, vat_amount: split.vat })
          .eq('daily_spec_id', specId)
          .eq('id', line.id)
      }
    }

    // daily_specs 합계 업데이트
    await db.from('daily_specs').update({ total_amount: totalAmount, vat_amount: totalVat }).eq('id', specId)

    // spec이 포함된 statement 라인 업데이트 + outstanding 재계산 (ground-truth 방식)
    const adminDb = createAdminClient()
    const { data: stmtLines } = await adminDb
      .from('sales_statement_lines')
      .select('id, sales_statement_id')
      .eq('source_doc_type', 'daily_spec')
      .eq('source_doc_id', specId)

    for (const stmtLine of stmtLines ?? []) {
      await adminDb.from('sales_statement_lines').update({ amount: totalAmount }).eq('id', stmtLine.id)

      const { data: linesOfStmt } = await adminDb
        .from('sales_statement_lines').select('amount').eq('sales_statement_id', stmtLine.sales_statement_id)
      const newStmtTotal = (linesOfStmt ?? []).reduce((s: number, l: { amount: unknown }) => s + Number(l.amount ?? 0), 0)

      const outstanding = await computeOutstanding(stmtLine.sales_statement_id, newStmtTotal)
      await syncStatementFinance(stmtLine.sales_statement_id, newStmtTotal, outstanding)
    }

    return NextResponse.json({ success: true, totalAmount })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '오류' }, { status: 500 })
  }
}
