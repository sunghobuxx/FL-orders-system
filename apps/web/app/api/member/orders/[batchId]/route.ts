export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase/server'

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

    const { data: orders } = await db.from('orders').select('id').eq('batch_id', batchId)
    const orderIds = (orders ?? []).map((o: { id: string }) => o.id)

    if (orderIds.length > 0) {
      await db.from('order_items').delete().in('order_id', orderIds)
      await db.from('orders').delete().in('batch_id', [batchId])
    }

    const { error } = await db.from('order_batches').delete().eq('id', batchId)
    if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[DELETE /api/member/orders/[batchId]]', e)
    return NextResponse.json({ error: '요청 처리 중 오류' }, { status: 500 })
  }
}
