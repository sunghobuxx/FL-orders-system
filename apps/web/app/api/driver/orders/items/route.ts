export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { computeOutstanding, syncStatementFinance } from '@/lib/settlement-finance'
import { requireBatchAccess, requireDriverUser } from '@/lib/driver-api'

interface ItemUpdate {
  id: string
  qty: number
  unit_price_snapshot: number
}

export async function POST(req: Request) {
  const ctx = await requireDriverUser(req)
  if ('error' in ctx) return ctx.error

  const { batchId, items } = await req.json().catch(() => ({})) as { batchId?: string; items?: ItemUpdate[] }
  if (!batchId || !items?.length) return NextResponse.json({ error: '필수 값 누락' }, { status: 400 })

  const access = await requireBatchAccess(ctx, batchId)
  if ('error' in access) return access.error

  for (const item of items) {
    if (item.qty <= 0) continue

    const { error: itemErr } = await ctx.db
      .from('order_items')
      .update({ qty: item.qty, unit_price_snapshot: item.unit_price_snapshot })
      .eq('id', item.id)
    if (itemErr) return NextResponse.json({ error: '저장 실패' }, { status: 500 })

    const { data: specLines } = await ctx.db
      .from('daily_spec_lines')
      .select('id, daily_spec_id, product_id')
      .eq('order_item_id', item.id)

    for (const specLine of specLines ?? []) {
      const { data: product } = await ctx.db
        .from('products')
        .select('taxable_flag')
        .eq('id', specLine.product_id)
        .single()
      const isTaxable = product?.taxable_flag ?? false
      const newVat = isTaxable ? Math.round(item.qty * item.unit_price_snapshot * 0.1) : 0

      await ctx.db
        .from('daily_spec_lines')
        .update({ qty: item.qty, unit_price: item.unit_price_snapshot, vat_amount: newVat, price_overridden: true })
        .eq('id', specLine.id)

      await syncSpecAndStatements(ctx.db, specLine.daily_spec_id)
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: Request) {
  const ctx = await requireDriverUser(req)
  if ('error' in ctx) return ctx.error

  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')
  const batchId = searchParams.get('batchId')
  if (!itemId || !batchId) return NextResponse.json({ error: '필수 값 누락' }, { status: 400 })

  const access = await requireBatchAccess(ctx, batchId)
  if ('error' in access) return access.error

  const { data: specLines } = await ctx.db
    .from('daily_spec_lines')
    .select('id, daily_spec_id')
    .eq('order_item_id', itemId)

  await ctx.db.from('dispatch_job_items').delete().eq('order_item_id', itemId)
  if (specLines?.length) {
    for (const sl of specLines) {
      await ctx.db.from('daily_spec_lines').delete().eq('id', sl.id)
    }
  }

  const { error } = await ctx.db.from('order_items').delete().eq('id', itemId)
  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })

  const affectedSpecIds = [...new Set((specLines ?? []).map(sl => sl.daily_spec_id))]
  for (const specId of affectedSpecIds) {
    await syncSpecAndStatements(ctx.db, specId)
  }

  return NextResponse.json({ success: true })
}

async function syncSpecAndStatements(db: any, dailySpecId: string) {
  const { data: allLines } = await db
    .from('daily_spec_lines')
    .select('amount, vat_amount')
    .eq('daily_spec_id', dailySpecId)

  const newSpecTotal = (allLines ?? []).reduce(
    (s: number, l: any) => s + Number(l.amount ?? 0) + Number(l.vat_amount ?? 0),
    0,
  )
  const newSpecVat = (allLines ?? []).reduce((s: number, l: any) => s + Number(l.vat_amount ?? 0), 0)

  await db
    .from('daily_specs')
    .update({ total_amount: newSpecTotal, vat_amount: newSpecVat })
    .eq('id', dailySpecId)

  const { data: stmtLines } = await db
    .from('sales_statement_lines')
    .select('id, sales_statement_id')
    .eq('source_doc_type', 'daily_spec')
    .eq('source_doc_id', dailySpecId)

  for (const stmtLine of stmtLines ?? []) {
    await db
      .from('sales_statement_lines')
      .update({ amount: newSpecTotal })
      .eq('id', stmtLine.id)

    const { data: linesOfStmt } = await db
      .from('sales_statement_lines')
      .select('amount')
      .eq('sales_statement_id', stmtLine.sales_statement_id)
    const newStmtTotal = (linesOfStmt ?? []).reduce((s: number, l: any) => s + Number(l.amount ?? 0), 0)
    const outstanding = await computeOutstanding(stmtLine.sales_statement_id, newStmtTotal)
    await syncStatementFinance(stmtLine.sales_statement_id, newStmtTotal, outstanding)
  }
}
