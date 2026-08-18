export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthorizedAdminDb } from '@/lib/admin-member-user'
import { getKstToday } from '@/lib/date-kst'
import { computeOutstanding, syncStatementFinance } from '@/lib/settlement-finance'
import { splitVat } from '@/lib/specs/vat'

export async function POST(req: NextRequest) {
  const { productId, organizationId, unitPrice } = await req.json() as {
    productId: string
    organizationId: string
    unitPrice: number
  }

  if (!productId || !organizationId || !unitPrice || unitPrice <= 0) {
    return NextResponse.json({ error: '필수 정보 누락' }, { status: 400 })
  }

  // 로그인만 봐서는 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
  const db = await getAuthorizedAdminDb()
  if (!db) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  const { error } = await db
    .from('org_product_prices')
    .upsert(
      { organization_id: organizationId, product_id: productId, unit_price: unitPrice },
      { onConflict: 'organization_id,product_id' },
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const today = getKstToday()

  const { data: restaurants } = await db
    .from('restaurants').select('id').eq('organization_id', organizationId)
  if (!restaurants?.length) return NextResponse.json({ success: true })

  const restaurantIds = restaurants.map((r: { id: string }) => r.id)

  const { data: specs } = await db
    .from('daily_specs').select('id')
    .in('restaurant_id', restaurantIds)
    .gte('business_date', today)
  if (!specs?.length) return NextResponse.json({ success: true })

  const specIds = specs.map((s: { id: string }) => s.id)

  const { data: specLines } = await db
    .from('daily_spec_lines')
    .select('id, daily_spec_id, qty')
    .in('daily_spec_id', specIds)
    .eq('product_id', productId)
  if (!specLines?.length) return NextResponse.json({ success: true })

  const { data: productMeta } = await db
    .from('products').select('taxable_flag').eq('id', productId).single()
  const taxable = (productMeta as { taxable_flag: boolean } | null)?.taxable_flag ?? false

  for (const line of specLines as { id: string; daily_spec_id: string; qty: number }[]) {
    // 단가는 부가세 포함 금액이다. 위에 얹지 않고 그 안에서 나눈다.
    const split = splitVat(taxable, Number(line.qty), unitPrice)
    await db
      .from('daily_spec_lines')
      .update({ unit_price: split.unitPrice, vat_amount: split.vat, price_overridden: true })
      .eq('id', line.id)
  }

  const affectedSpecIds = [...new Set((specLines as { daily_spec_id: string }[]).map(l => l.daily_spec_id))]
  for (const specId of affectedSpecIds) {
    const { data: allLines } = await db
      .from('daily_spec_lines').select('qty, unit_price, vat_amount')
      .eq('daily_spec_id', specId)

    const newSpecTotal = (allLines ?? []).reduce(
      (s: number, l: { qty: number; unit_price: number; vat_amount: number }) =>
        s + Number(l.qty) * Number(l.unit_price) + Number(l.vat_amount ?? 0),
      0,
    )
    const newSpecVat = (allLines ?? []).reduce(
      (s: number, l: { vat_amount: number }) => s + Number(l.vat_amount ?? 0),
      0,
    )

    await db.from('daily_specs')
      .update({ total_amount: newSpecTotal, vat_amount: newSpecVat })
      .eq('id', specId)

    const { data: stmtLines } = await db
      .from('sales_statement_lines').select('id, sales_statement_id')
      .eq('source_doc_type', 'daily_spec')
      .eq('source_doc_id', specId)

    for (const stmtLine of (stmtLines ?? []) as { id: string; sales_statement_id: string }[]) {
      await db.from('sales_statement_lines')
        .update({ amount: newSpecTotal }).eq('id', stmtLine.id)

      const { data: linesOfStmt } = await db
        .from('sales_statement_lines').select('amount')
        .eq('sales_statement_id', stmtLine.sales_statement_id)
      const newStmtTotal = (linesOfStmt ?? []).reduce(
        (s: number, l: { amount: number }) => s + Number(l.amount ?? 0),
        0,
      )

      const outstanding = await computeOutstanding(stmtLine.sales_statement_id, newStmtTotal)
      await syncStatementFinance(stmtLine.sales_statement_id, newStmtTotal, outstanding)
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const { productId, organizationId } = await req.json() as {
    productId: string
    organizationId: string
  }

  if (!productId || !organizationId) {
    return NextResponse.json({ error: '필수 정보 누락' }, { status: 400 })
  }

  const db = createAdminClient()
  const { error } = await db
    .from('org_product_prices')
    .delete()
    .eq('organization_id', organizationId)
    .eq('product_id', productId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
