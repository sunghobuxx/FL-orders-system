export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { computeOutstanding, syncStatementFinance } from '@/lib/settlement-finance'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const { specId } = await req.json() as { specId: string }
    if (!specId) return NextResponse.json({ error: 'specId 누락' }, { status: 400 })

    const { user, supabase: db } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { data: spec } = await db
      .from('daily_specs').select('id, business_date, restaurant_id, total_amount').eq('id', specId).single()
    if (!spec) return NextResponse.json({ error: '명세서를 찾을 수 없습니다.' }, { status: 404 })

    const { data: lines } = await db
      .from('daily_spec_lines').select('id, product_id, qty, vat_amount, price_overridden, unit_price').eq('daily_spec_id', specId)
    if (!lines?.length) return NextResponse.json({ error: '명세서 라인이 없습니다.' }, { status: 400 })

    // 단가 적용 우선순위:
    // 1. price_overridden=true → 수동 단가 유지 (아래에서 처리)
    // 2. effective_from = business_date (당일 단가)
    // 3. is_fixed_price=true → effective_from 무관 최근 단가
    // 4. carry-forward (effective_from ≤ business_date 최근)
    const productIds = [...new Set(lines.map(l => l.product_id))]
    const { data: spRows } = await db
      .from('supplier_products').select('id, product_id').in('product_id', productIds).eq('status', 'active')
    const spIds = (spRows ?? []).map(r => r.id)
    const spToProduct = Object.fromEntries((spRows ?? []).map(r => [r.id, r.product_id]))

    const { data: productsMeta } = await db
      .from('products').select('id, is_fixed_price, taxable_flag').in('id', productIds)
    const fixedMap = Object.fromEntries(
      (productsMeta ?? []).map(p => [p.id, p.is_fixed_price])
    )
    const taxableMap = Object.fromEntries(
      (productsMeta ?? []).map(p => [p.id, p.taxable_flag ?? false])
    )

    const priceMap: Record<string, number> = {}
    if (spIds.length) {
      // 우선순위 2: 당일 단가
      const { data: exactSnaps } = await db
        .from('price_snapshots').select('supplier_product_id, sale_price')
        .in('supplier_product_id', spIds).eq('effective_from', spec.business_date)
        .order('created_at', { ascending: false })
      for (const s of exactSnaps ?? []) {
        const pid = spToProduct[s.supplier_product_id]
        if (pid && priceMap[pid] === undefined) priceMap[pid] = Number(s.sale_price)
      }

      // 우선순위 3: 고정단가 품목
      const fixedSpIds = (spRows ?? []).filter(r => priceMap[r.product_id] === undefined && fixedMap[r.product_id]).map(r => r.id)
      if (fixedSpIds.length) {
        const { data: fixedSnaps } = await db
          .from('price_snapshots').select('supplier_product_id, sale_price')
          .in('supplier_product_id', fixedSpIds)
          .order('effective_from', { ascending: false }).order('created_at', { ascending: false })
        for (const s of fixedSnaps ?? []) {
          const pid = spToProduct[s.supplier_product_id]
          if (pid && priceMap[pid] === undefined) priceMap[pid] = Number(s.sale_price)
        }
      }

      // 우선순위 4: carry-forward
      const remainSpIds = (spRows ?? []).filter(r => priceMap[r.product_id] === undefined).map(r => r.id)
      if (remainSpIds.length) {
        const { data: carrySnaps } = await db
          .from('price_snapshots').select('supplier_product_id, sale_price')
          .in('supplier_product_id', remainSpIds).lte('effective_from', spec.business_date)
          .order('effective_from', { ascending: false }).order('created_at', { ascending: false })
        for (const s of carrySnaps ?? []) {
          const pid = spToProduct[s.supplier_product_id]
          if (pid && priceMap[pid] === undefined) priceMap[pid] = Number(s.sale_price)
        }
      }
    }

    // spec_lines 업데이트: price_overridden=true인 라인은 수동 단가 유지
    let totalAmount = 0
    let totalVat = 0
    for (const line of lines) {
      // 우선순위 1: 명세서에서 수동 입력된 단가 → 그대로 유지
      const unitPrice = line.price_overridden
        ? Number(line.unit_price)
        : (priceMap[line.product_id] ?? Number(line.unit_price))

      const amount = Number(line.qty) * unitPrice
      const vat = taxableMap[line.product_id] ? Math.round(amount * 0.1) : 0
      totalAmount += amount + vat
      totalVat += vat

      if (!line.price_overridden) {
        await db.from('daily_spec_lines')
          .update({ unit_price: unitPrice, vat_amount: vat })
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
