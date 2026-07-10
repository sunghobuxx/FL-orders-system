'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getKstToday } from '@/lib/date-kst'
import { computeOutstanding, syncStatementFinance } from '@/lib/settlement-finance'

export async function upsertOrgProductPrice(
  productId: string,
  organizationId: string,
  unitPrice: number,
): Promise<{ success: boolean; error?: string }> {
  const db = createAdminClient()

  const { error } = await db
    .from('org_product_prices')
    .upsert(
      { organization_id: organizationId, product_id: productId, unit_price: unitPrice },
      { onConflict: 'organization_id,product_id' },
    )
  if (error) return { success: false, error: error.message }

  const today = getKstToday()

  const { data: restaurants } = await db
    .from('restaurants').select('id').eq('organization_id', organizationId)
  if (!restaurants?.length) return { success: true }

  const restaurantIds = restaurants.map((r: { id: string }) => r.id)

  const { data: specs } = await db
    .from('daily_specs').select('id')
    .in('restaurant_id', restaurantIds)
    .gte('business_date', today)
  if (!specs?.length) return { success: true }

  const specIds = specs.map((s: { id: string }) => s.id)

  const { data: specLines } = await db
    .from('daily_spec_lines')
    .select('id, daily_spec_id, qty')
    .in('daily_spec_id', specIds)
    .eq('product_id', productId)
  if (!specLines?.length) return { success: true }

  const { data: productMeta } = await db
    .from('products').select('taxable_flag').eq('id', productId).single()
  const taxable = (productMeta as { taxable_flag: boolean } | null)?.taxable_flag ?? false

  for (const line of specLines as { id: string; daily_spec_id: string; qty: number }[]) {
    const newVat = taxable ? Math.round(Number(line.qty) * unitPrice * 0.1) : 0
    await db
      .from('daily_spec_lines')
      .update({ unit_price: unitPrice, vat_amount: newVat, price_overridden: true })
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

  return { success: true }
}

export async function deleteOrgProductPrice(
  productId: string,
  organizationId: string,
): Promise<{ success: boolean; error?: string }> {
  const db = createAdminClient()
  const { error } = await db
    .from('org_product_prices')
    .delete()
    .eq('organization_id', organizationId)
    .eq('product_id', productId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}
