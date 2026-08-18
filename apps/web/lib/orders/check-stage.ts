/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 발주 품목 확인 체크.
 *
 *   stage 1 = 상차 확인 → 전 품목이 1 이 되면 배치 ordered (배송중)
 *   stage 2 = 배송 확인 → 전 품목이 2 가 되면 배치 dispatched (배송완료)
 *
 * 어드민 화면과 배송앱이 같은 값을 봐야 하므로 한 곳에 둔다.
 * 예전에는 어드민에만 있었고 배송앱은 화면 안(useState)에서만 체크를 들고 있었다.
 * 그래서 기사님이 품목을 눌러도 서버에는 아무것도 남지 않았고, 어드민 「당일발주」의
 * 배송 상태가 종일 그대로였다 (2026-08-18: 배송완료 배치인데 체크 0 인 곳이 5곳).
 *
 * 배치 상태는 뒤로 가지 않는다. 확인을 해제해도 이미 배송중이 된 발주가
 * 알림톡발송으로 되돌아가면 현장이 헷갈린다.
 */

const RANK: Record<string, number> = {
  open: 0, submitted: 1, validated: 2, ordered: 3, dispatched: 4, completed: 5,
}

export interface CheckStageResult {
  batchId: string
  batchStatus: string
  /** 다음에 눌러야 할 단계 */
  requiredStage: number
  confirmed: number
  total: number
}

export type CheckStageError =
  | { error: '품목을 찾을 수 없습니다'; status: 404 }
  | { error: '발주를 찾을 수 없습니다'; status: 404 }

/**
 * @param db       service role 클라이언트
 * @param itemIds  확인할 order_items id
 * @param stage    0 해제 / 1 상차 / 2 배송
 * @param batchGuard 그 배치의 품목만 건드리게 제한한다 (배송앱은 담당 배치만 만질 수 있다)
 */
export async function applyCheckStage(
  db: any,
  itemIds: string[],
  stage: number,
  batchGuard?: string,
): Promise<CheckStageResult | CheckStageError> {
  const { data: touched, error: updateError } = await db
    .from('order_items')
    .update({ check_stage: stage })
    .in('id', itemIds)
    .select('id, order_id')
  if (updateError) throw updateError
  if (!touched?.length) return { error: '품목을 찾을 수 없습니다', status: 404 }

  const { data: order } = await db
    .from('orders').select('batch_id').eq('id', touched[0].order_id).maybeSingle()
  const batchId = order?.batch_id
  if (!batchId) return { error: '발주를 찾을 수 없습니다', status: 404 }
  if (batchGuard && batchGuard !== batchId) {
    return { error: '품목을 찾을 수 없습니다', status: 404 }
  }

  const { data: orders } = await db.from('orders').select('id').eq('batch_id', batchId)
  const orderIds = (orders ?? []).map((o: { id: string }) => o.id)
  const { data: allItems } = await db
    .from('order_items').select('check_stage').in('order_id', orderIds)

  const stages: number[] = (allItems ?? []).map((i: { check_stage: number }) => Number(i.check_stage ?? 0))
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

  const requiredStage = (RANK[nextStatus] ?? 0) >= RANK.ordered ? 2 : 1
  const confirmed = stages.filter(s => s >= requiredStage).length

  return { batchId, batchStatus: nextStatus, requiredStage, confirmed, total }
}
