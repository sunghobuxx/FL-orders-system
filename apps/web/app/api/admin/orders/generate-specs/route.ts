export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'
import { syncSpecFromOrders } from '@/lib/specs/sync'

export async function POST(req: Request) {
  try {
    const { businessDate } = await req.json() as { businessDate: string }
    if (!businessDate) return NextResponse.json({ error: '날짜 누락' }, { status: 400 })

    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    // 데이터 작업은 service role 로 한다. 세션(RLS)으로 쓰면 막혀도 에러가 안 나
    // 조용히 실패하거나 조회가 null 이 되어 엉뚱한 404 가 난다.
    const adminDb = createAdminClient()

    const { data: batches } = await adminDb
      .from('order_batches').select('id, restaurant_id')
      .eq('business_date', businessDate)
      .in('status', ['validated', 'ordered', 'dispatched', 'completed'])

    if (!batches?.length) return NextResponse.json({ error: '명세서를 생성할 배치가 없습니다.' }, { status: 400 })

    // restaurant_id → organization_id 매핑 일괄 조회
    const restaurantIds = [...new Set(batches.map((b: { restaurant_id: string }) => b.restaurant_id))]
    const { data: restaurantRows } = await adminDb
      .from('restaurants').select('id, organization_id').in('id', restaurantIds)
    const restaurantOrgMap = Object.fromEntries(
      (restaurantRows ?? []).map((r: { id: string; organization_id: string | null }) => [r.id, r.organization_id])
    )

    let created = 0
    for (const batch of batches) {
      const { data: orders } = await adminDb.from('orders').select('id').eq('batch_id', batch.id)
      const orderIds = (orders ?? []).map((o: { id: string }) => o.id)
      const specId = await syncSpecFromOrders(adminDb, {
        restaurantId: batch.restaurant_id,
        businessDate,
        orderIds,
        organizationId: restaurantOrgMap[batch.restaurant_id] ?? null,
      })
      if (specId) created++
    }

    return NextResponse.json({ success: true, created })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '오류 발생' }, { status: 500 })
  }
}
