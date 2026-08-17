export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { requireBatchAccess, requireDriverUser } from '@/lib/driver-api'

const STATUS_FLOW = ['open', 'submitted', 'validated', 'ordered', 'dispatched', 'completed'] as const

/**
 * 배치 상태에 맞는 품목 확인 단계.
 *
 *   ordered(배송중)   → 1  상차 확인
 *   dispatched(배송완료) → 2  배송 확인
 *
 * 어드민 화면(check-items)이 쓰는 규칙과 같다.
 */
function stageForStatus(status: string): number | null {
  if (status === 'ordered') return 1
  if (status === 'dispatched' || status === 'completed') return 2
  return null
}

export async function POST(req: Request) {
  const ctx = await requireDriverUser(req)
  if ('error' in ctx) return ctx.error

  const { batchId, newStatus } = await req.json().catch(() => ({})) as { batchId?: string; newStatus?: string }
  if (!batchId || !newStatus) return NextResponse.json({ error: '필수 값 누락' }, { status: 400 })
  if (!STATUS_FLOW.includes(newStatus as typeof STATUS_FLOW[number])) {
    return NextResponse.json({ error: '올바르지 않은 상태입니다.' }, { status: 400 })
  }

  const access = await requireBatchAccess(ctx, batchId)
  if ('error' in access) return access.error

  const currentIndex = STATUS_FLOW.indexOf(access.batch.status as typeof STATUS_FLOW[number])
  const nextIndex = STATUS_FLOW.indexOf(newStatus as typeof STATUS_FLOW[number])
  if (nextIndex <= currentIndex) return NextResponse.json({ error: '이미 처리된 상태입니다.' }, { status: 400 })

  const { error } = await ctx.db.from('order_batches').update({ status: newStatus }).eq('id', batchId)
  if (error) return NextResponse.json({ error: '상태 업데이트에 실패했습니다.' }, { status: 500 })

  // 품목 확인 단계도 함께 채운다.
  //
  // 예전에는 배치 상태만 바꿔서, 배송앱으로 「배송중·배송완료」를 눌러도 어드민
  // 배송프로세스의 품목 체크는 빈 채로 남았다. 같은 일을 두 화면이 따로 기록하니
  // 서로 어긋났다 — 2026-08-17 고강점은 ordered 인데 11품목 체크가 0이었다.
  //
  // 이미 더 앞선 단계로 찍힌 품목은 되돌리지 않는다(`lt`). 기사님이 품목별로 먼저
  // 확인해 둔 것을 상태 변경이 덮어쓰면 안 된다.
  const stage = stageForStatus(newStatus)
  if (stage !== null) {
    const { data: orders } = await ctx.db
      .from('orders').select('id').eq('batch_id', batchId)
    const orderIds = (orders ?? []).map((o: { id: string }) => o.id)

    if (orderIds.length) {
      const { error: stageError } = await ctx.db
        .from('order_items')
        .update({ check_stage: stage })
        .in('order_id', orderIds)
        .lt('check_stage', stage)
      // 체크를 못 채워도 상태 변경은 이미 끝났다. 되돌리면 기사님이 다시 눌러야 한다.
      if (stageError) console.error('[driver/orders/status] 품목 확인 단계 갱신 실패', stageError)
    }
  }

  return NextResponse.json({ success: true })
}
