export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { requireBatchAccess, requireDriverUser } from '@/lib/driver-api'
import { applyCheckStage } from '@/lib/orders/check-stage'

/**
 * 배송앱에서 품목 확인을 누를 때 부른다.
 *
 * 예전에는 앱이 체크를 화면 안(useState)에서만 들고 있어서 서버에 아무것도 안 남았다.
 * 기사님이 하루 종일 확인해도 어드민 「당일발주」의 배송 상태는 그대로였고,
 * 사장님이 오후에 손으로 배송완료로 바꾸고 계셨다 (2026-08-18 확인).
 *
 * 어드민의 check-items 와 같은 계산을 쓴다 — 전 품목이 차면 배치 상태가 따라 올라간다.
 * 담당 배치인지 확인하므로 남의 업체 발주는 못 건드린다.
 */
export async function POST(req: Request) {
  const ctx = await requireDriverUser(req)
  if ('error' in ctx) return ctx.error

  const { batchId, itemIds, stage } = await req.json().catch(() => ({})) as {
    batchId?: string; itemIds?: string[]; stage?: number
  }
  if (!batchId) return NextResponse.json({ error: '발주 정보가 없습니다.' }, { status: 400 })
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return NextResponse.json({ error: '품목이 없습니다.' }, { status: 400 })
  }
  if (![0, 1, 2].includes(Number(stage))) {
    return NextResponse.json({ error: '확인 단계가 올바르지 않습니다.' }, { status: 400 })
  }

  const access = await requireBatchAccess(ctx, batchId)
  if ('error' in access) return access.error

  try {
    const result = await applyCheckStage(ctx.db, itemIds, Number(stage), batchId)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    console.error('[POST /api/driver/orders/check-items]', e)
    return NextResponse.json({ error: '확인 처리에 실패했습니다.' }, { status: 500 })
  }
}
