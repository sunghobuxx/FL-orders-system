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
