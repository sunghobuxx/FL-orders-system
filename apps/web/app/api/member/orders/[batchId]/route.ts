export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cleanSpecAfterBatchDelete } from '@/lib/specs/cleanup-deleted-batch'

// 멤버 발주 삭제 (02:00 전, open/submitted 상태만 가능)
export async function DELETE(_req: NextRequest, context: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await context.params
    const { supabase: db, user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

    // 02:00 KST 이후 차단
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const kstMinutes = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes()
    const kstToday = kstNow.toISOString().split('T')[0]

    // 배치 확인 (본인 소유 + 수정 가능 상태)
    const { data: batch } = await db
      .from('order_batches')
      .select('id, status, business_date, restaurant_id')
      .eq('id', batchId)
      .single()

    if (!batch) return NextResponse.json({ error: '발주를 찾을 수 없습니다' }, { status: 404 })
    if (!['open', 'submitted'].includes(batch.status)) {
      return NextResponse.json({ error: '처리 중인 발주는 삭제할 수 없습니다' }, { status: 400 })
    }
    if (kstMinutes >= 120 && batch.business_date === kstToday) {
      return NextResponse.json({ error: '발주 마감 시간(02:00)이 지났습니다' }, { status: 403 })
    }
    // 지난 날짜의 발주는 지울 수 없다. 이미 청구된 기간의 금액이 명세서·정산서에서 빠지게 된다.
    if (batch.business_date < kstToday) {
      return NextResponse.json({ error: '지난 날짜의 발주는 삭제할 수 없습니다' }, { status: 403 })
    }

    // 본인 업체의 발주인지 확인한다. 아래에서 관리자 권한으로 명세서·정산서를 고치므로 RLS 에만 맡기지 않는다
    // (회원 발주 POST 와 같은 검증).
    const adminDb = createAdminClient()
    const { data: restaurant } = await adminDb
      .from('restaurants').select('id, organization_id').eq('id', batch.restaurant_id).maybeSingle()
    const { data: membership } = restaurant
      ? await adminDb.from('memberships').select('organization_id')
          .eq('user_id', user.id).eq('organization_id', restaurant.organization_id).maybeSingle()
      : { data: null }
    if (!membership) return NextResponse.json({ error: '해당 식당의 발주 권한이 없습니다' }, { status: 403 })

    const { data: orders } = await db.from('orders').select('id').eq('batch_id', batchId)
    const orderIds = (orders ?? []).map((o: { id: string }) => o.id)

    let itemIds: string[] = []
    let productIds: string[] = []
    if (orderIds.length > 0) {
      const { data: items } = await db.from('order_items').select('id, product_id').in('order_id', orderIds)
      itemIds = (items ?? []).map((i: { id: string }) => i.id)
      productIds = [...new Set((items ?? []).map((i: { product_id: string }) => i.product_id))] as string[]
      const { error: itemsError } = await db.from('order_items').delete().in('order_id', orderIds)
      const { error: ordersError } = itemsError ? { error: null } : await db.from('orders').delete().in('batch_id', [batchId])
      if (itemsError || ordersError) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
    }

    // 실제로 지워졌는지 돌려받아 확인한다. RLS 에 막히면 PostgREST 는 에러 없이 0행만 지우고 성공처럼 응답한다.
    const { data: deleted, error } = await db.from('order_batches').delete().eq('id', batchId).select('id')
    if (error || !deleted?.length) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })

    // 삭제가 끝난 뒤에 그 발주로 만든 명세서 줄과 정산서 금액도 정리한다(명세서·정산서는 회원 권한으로 못 고치므로 관리자 클라이언트).
    // 정리가 실패해도 삭제는 이미 끝났으니 성공으로 응답하고 로그를 남긴다.
    if (itemIds.length > 0) {
      try {
        await cleanSpecAfterBatchDelete(adminDb, {
          restaurantId: batch.restaurant_id, businessDate: batch.business_date, itemIds, productIds,
        })
      } catch (e) {
        console.error('[DELETE /api/member/orders/[batchId]] 명세서 정리 실패', batchId, e)
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[DELETE /api/member/orders/[batchId]]', e)
    return NextResponse.json({ error: '요청 처리 중 오류' }, { status: 500 })
  }
}
