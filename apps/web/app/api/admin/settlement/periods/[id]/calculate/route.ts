export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeOutstanding, syncStatementFinance } from '@/lib/settlement-finance'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: periodId } = await params
    const db = createAdminClient()

    const { data: period } = await db
      .from('settlement_periods')
      .select('id, period_type, start_date, end_date')
      .eq('id', periodId)
      .single()
    if (!period) return NextResponse.json({ error: '기간 없음' }, { status: 404 })

    // 기간 내 명세서 조회
    const { data: specs } = await db
      .from('daily_specs')
      .select('id, restaurant_id, total_amount')
      .gte('business_date', period.start_date)
      .lte('business_date', period.end_date)

    if (!specs?.length) return NextResponse.json({ message: '명세서 없음', count: 0 })

    // restaurant_id별 합산
    const byRestaurant = new Map<string, { total: number; specIds: string[] }>()
    for (const spec of specs) {
      const existing = byRestaurant.get(spec.restaurant_id)
      if (existing) {
        existing.total += Number(spec.total_amount ?? 0)
        existing.specIds.push(spec.id)
      } else {
        byRestaurant.set(spec.restaurant_id, { total: Number(spec.total_amount ?? 0), specIds: [spec.id] })
      }
    }

    // restaurant → organization 매핑
    const restaurantIds = [...byRestaurant.keys()]
    const { data: restaurants } = await db
      .from('restaurants')
      .select('id, organization_id')
      .in('id', restaurantIds)
    const orgMap = Object.fromEntries((restaurants ?? []).map(r => [r.id as string, r.organization_id as string]))

    let count = 0
    for (const [restaurantId, { total, specIds }] of byRestaurant) {
      const organizationId = orgMap[restaurantId]

      // upsert sales_statement
      const { data: stmt, error: stmtErr } = await db
        .from('sales_statements')
        .upsert({
          restaurant_id: restaurantId,
          organization_id: organizationId,
          settlement_period_id: periodId,
          period_start: period.start_date,
          period_end: period.end_date,
          total_amount: total,
          status: 'unpaid',
        }, { onConflict: 'restaurant_id,settlement_period_id' })
        .select('id')
        .single()

      if (stmtErr || !stmt) continue

      // statement lines 동기화
      await db.from('sales_statement_lines').delete().eq('sales_statement_id', stmt.id)
      await db.from('sales_statement_lines').insert(
        specIds.map(specId => ({
          sales_statement_id: stmt.id,
          source_doc_type: 'daily_spec',
          source_doc_id: specId,
          amount: specs.find(s => s.id === specId)?.total_amount ?? 0,
        }))
      )

      const outstanding = await computeOutstanding(stmt.id, total)
      await syncStatementFinance(stmt.id, total, outstanding)
      count++
    }

    return NextResponse.json({ success: true, count })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '오류' }, { status: 500 })
  }
}
