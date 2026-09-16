export type OrderSnapshot = { businessDate: string; orderId: string | null; quantities: Record<string, string>; units: Record<string, string> }
export function orderFingerprint(value: OrderSnapshot) {
  return JSON.stringify([value.businessDate, value.orderId, Object.keys(value.quantities).sort().map(id => [id, Number(value.quantities[id]), value.units[id]])])
}
export function shouldKeepDraft(dirty: boolean, discard: boolean) { return dirty && !discard }
export function progressStep(status?: string | null) {
  return status === 'completed' ? 3 : ['submitted', 'validated', 'ordered', 'dispatched'].indexOf(status ?? '')
}
