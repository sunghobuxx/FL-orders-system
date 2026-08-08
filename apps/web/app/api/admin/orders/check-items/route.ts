export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

/**
 * 발주 품목 확인 체크. 확인이 다 차면 배치 상태를 다음 칸으로 옮긴다.
 *
 *   stage 1 = 상차 확인 → 전 품목이 1 이 되면 배치 ordered (배송중)
 *   stage 2 = 배송 확인 → 전 품목이 2 가 되면 배치 dispatched (배송완료)
 *
 * 확인 상태는 예전에 브라우저 localStorage 에 있었다. 그래서 확인을 해도 어드민 목록,
 * 회원 진행상황, 공급처별 발주 내역 어디에도 반영되지 않았고 기기를 바꾸면 사라졌다.
 * 이제 order_items.check_stage 에 두어 어느 화면에서 눌러도 같은 값을 본다.
 *
 * 배치 상태는 뒤로 가지 않는다. 확인을 해제해도 이미 배송중이 된 발주가
 * 알림톡발송으로 되돌아가면 현장이 헷갈린다.
 */

const RANK: Record<string, number> = {
  open: 0, submitted: 1, validated: 2, ordered: 3, dispatched: 4, completed: 5,
}

export async function POST(req: NextRequest) {
  try {
    const { itemIds, stage } = await req.json() as { itemIds?: string[]; stage?: number }
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json({ error: '품목이 없습니다' }, { status: 400 })
    }
    if (![0, 1, 2].includes(Number(stage))) {
      return NextResponse.json({ error: '확인 단계가 올바르지 않습니다' }, { status: 400 })
    }

    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

    const db = createAdminClient()

    const { data: touched, error: updateError } = await db
      .from('order_items')
      .update({ check_stage: stage })
      .in('id', itemIds)
      .select('id, order_id')
    if (updateError) throw updateError
    if (!touched?.length) return NextResponse.json({ error: '품목을 찾을 수 없습니다' }, { status: 404 })

    // 이 품목들이 속한 배치의 전체 확인 상태를 다시 센다.
    const { data: order } = await db
      .from('orders').select('batch_id').eq('id', touched[0].order_id).maybeSingle()
    const batchId = order?.batch_id
    if (!batchId) return NextResponse.json({ error: '발주를 찾을 수 없습니다' }, { status: 404 })

    const { data: orders } = await db.from('orders').select('id').eq('batch_id', batchId)
    const orderIds = (orders ?? []).map((o: { id: string }) => o.id)
    const { data: allItems } = await db
      .from('order_items').select('check_stage').in('order_id', orderIds)

    const stages = (allItems ?? []).map((i: { check_stage: number }) => Number(i.check_stage ?? 0))
    const total = stages.length
    const minStage = total ? Math.min(...stages) : 0

    const { data: batch } = await db
      .from('order_batches').select('status').eq('id', batchId).maybeSingle()
    const current = batch?.status ?? ''

    const target = minStage >= 2 ? 'dispatched' : minStage >= 1 ? 'ordered' : null
    let nextStatus = current
    if (target && (RANK[target] ?? 0) > (RANK[current] ?? 0)) {
      const { error: statusError } = await db
        .from('order_batches').update({ status: target }).eq('id', batchId)
      if (statusError) throw statusError
      nextStatus = target
    }

    // 다음에 눌러야 할 단계. 배송중까지 갔으면 이제 2 단계를 받는다.
    const requiredStage = (RANK[nextStatus] ?? 0) >= RANK.ordered ? 2 : 1
    const confirmed = stages.filter(s => s >= requiredStage).length

    return NextResponse.json({
      success: true, batchId, batchStatus: nextStatus, requiredStage, confirmed, total,
    })
  } catch (e) {
    console.error('[POST /api/admin/orders/check-items]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '확인 처리 중 오류가 발생했습니다' },
      { status: 500 },
    )
  }
}
