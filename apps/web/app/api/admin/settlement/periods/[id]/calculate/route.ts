export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'
import { computeOutstanding, syncStatementFinance } from '@/lib/settlement-finance'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // 청구·미수금을 만드는 주소다. 로그인 없이 부를 수 있으면 안 된다.
    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

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
      .select('id, organization_id, settlement_cycle')
      .in('id', restaurantIds)
    const orgMap = Object.fromEntries((restaurants ?? []).map(r => [r.id as string, r.organization_id as string]))

    // 업체의 정산 주기와 기간 유형이 같을 때만 만든다.
    // 이게 없으면 주정산 기간을 계산할 때 월정산 업체에도 주정산서가 생겨
    // 같은 명세서를 두 번 청구하게 된다. (2026-07-24 사고, 2026-08-01 재정리)
    const cycleMap = Object.fromEntries(
      (restaurants ?? []).map(r => [r.id as string, (r.settlement_cycle as string | null) ?? 'weekly'])
    )

    let count = 0
    let skippedCycle = 0
    for (const [restaurantId, { total, specIds }] of byRestaurant) {
      if (cycleMap[restaurantId] !== period.period_type) { skippedCycle++; continue }
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

    return NextResponse.json({ success: true, count, skippedCycle })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '오류' }, { status: 500 })
  }
}
