export const runtime = 'edge'

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCarryover } from '@/lib/settlement/carryover'
import AutoPrint from '@/app/member/spec/print/AutoPrint'
import StatementSheet, { type StatementSheetRow } from '@/components/StatementSheet'

interface Props {
  params: Promise<{ restaurantId: string; statementId: string }>
}

export default async function AdminStatementPrintPage({ params }: Props) {
  const { restaurantId, statementId } = await params
  const db = createAdminClient()

  const { data: stmt } = await db
    .from('sales_statements')
    .select('id, total_amount, outstanding_amount, settlement_periods(period_type, start_date, end_date), restaurants(organizations(name))')
    .eq('id', statementId)
    .eq('restaurant_id', restaurantId)
    .single()

  if (!stmt) notFound()

  type Period = { period_type: string; start_date: string; end_date: string }
  const period = stmt.settlement_periods as unknown as Period | null
  const orgName = (stmt.restaurants as unknown as { organizations: { name: string } | null } | null)?.organizations?.name ?? '알 수 없음'
  const totalAmount = Number(stmt.total_amount ?? 0)
  const outstandingAmount = Number(stmt.outstanding_amount ?? 0)
  const paidAmount = totalAmount - outstandingAmount
  // 화면과 같은 계산을 쓴다. 예전에는 프린트에 이전 미수금 항목이 아예 없어
  // 거래처가 받는 종이와 화면 금액이 달랐다.
  const { previous: carryover, totalDue } = await getCarryover(
    db, restaurantId, statementId, outstandingAmount, period?.start_date ?? null)

  const { data: dailySpecsRaw } = period
    ? await db
        .from('daily_specs')
        .select('id, business_date, total_amount')
        .eq('restaurant_id', restaurantId)
        .gte('business_date', period.start_date)
        .lte('business_date', period.end_date)
        .order('business_date', { ascending: true })
    : { data: [] }
  const dailySpecs = dailySpecsRaw ?? []

  const specIds = dailySpecs.map(s => s.id)
  type SpecLineRow = { daily_spec_id: string; qty: number; unit: string; products: { standard_name: string } | null }
  const linesBySpec: Record<string, SpecLineRow[]> = {}
  if (specIds.length > 0) {
    const { data: allSpecLines } = await db
      .from('daily_spec_lines')
      .select('daily_spec_id, qty, unit, products(standard_name)')
      .in('daily_spec_id', specIds)
    for (const l of allSpecLines ?? []) {
      const row = l as unknown as SpecLineRow
      if (!linesBySpec[row.daily_spec_id]) linesBySpec[row.daily_spec_id] = []
      linesBySpec[row.daily_spec_id].push(row)
    }
  }

  function summarize(specId: string): string {
    const rows = linesBySpec[specId] ?? []
    if (!rows.length) return '-'
    return rows.map(l => {
      const name = l.products?.standard_name ?? '품목'
      const q = Number(l.qty) % 1 === 0 ? Number(l.qty) : Number(l.qty).toFixed(1)
      return `${name} ${q}${l.unit}`
    }).join(' + ')
  }

  const pYear = period ? Number(period.start_date.split('-')[0]) : 0
  const pMon  = period ? Number(period.start_date.split('-')[1]) : 0
  const pDay  = period ? Number(period.start_date.split('-')[2]) : 0
  const weekNum  = Math.ceil(pDay / 7)
  const endDay   = period ? Number(period.end_date.split('-')[2]) : 0
  const printTitle = period?.period_type === 'monthly'
    ? `${pMon}월 발주 정산서`
    : `${pMon}월 ${weekNum}주 발주 정산서`
  const printDate = period ? `${pYear}.${pMon}.${endDay}` : ''

  const sheetRows: StatementSheetRow[] = dailySpecs.map(spec => {
    const [, sm, sd] = spec.business_date.split('-')
    return {
      key: spec.id,
      date: `${pYear}.${Number(sm)}.${Number(sd)}`,
      itemCount: (linesBySpec[spec.id] ?? []).length,
      summary: summarize(spec.id),
      amount: Number(spec.total_amount),
    }
  })

  return (
    <>
      <AutoPrint />
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-size: 11pt; padding: 10mm; background: white; }
        @media print { @page { size: A4; margin: 10mm; } }
      `}</style>

      <StatementSheet
        title={printTitle}
        issuedOn={printDate}
        orgName={orgName}
        rows={sheetRows}
        totalAmount={totalAmount}
        carryover={carryover}
        paidAmount={paidAmount}
        outstandingAmount={outstandingAmount}
        totalDue={totalDue}
        minRows={5}
      />
    </>
  )
}
