export function orderCheckState(status: string) {
  const done = status === 'dispatched' || status === 'completed'
  const requiredStage = status === 'ordered' || done ? 2 : 1
  return { done, requiredStage, label: requiredStage === 1 ? '상차 확인' : '배송 확인' }
}

export function nextOrderCheckStage(status: string, stage: number): number | null {
  const { done, requiredStage } = orderCheckState(status)
  if (done) return null
  return stage >= requiredStage ? requiredStage - 1 : requiredStage
}

/** Only incomplete items are included, so bulk loading never lowers a delivery check. */
export function pendingOrderCheckIds(status: string, items: Array<{ id: string; check_stage?: number; checkStage?: number }>) {
  const { done, requiredStage } = orderCheckState(status)
  return done ? [] : items.filter(item => Number(item.check_stage ?? item.checkStage ?? 0) < requiredStage).map(item => item.id)
}

export function orderCheckPresentation(status: string) {
  const { done, requiredStage } = orderCheckState(status)
  return done
    ? { color: '#15803D', background: '#DCFCE7', text: '배송완료', next: '' }
    : requiredStage === 2
      ? { color: '#1D4ED8', background: '#DBEAFE', text: '상차 완료 · 배송 확인', next: '배송완료' }
      : { color: '#92400E', background: '#FEF3C7', text: '상차 확인', next: '배송중' }
}
