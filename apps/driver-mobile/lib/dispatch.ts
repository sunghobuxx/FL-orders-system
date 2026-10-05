export function defaultDispatchDate(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  if (kst.getUTCHours() >= 18) kst.setUTCDate(kst.getUTCDate() + 1)
  return kst.toISOString().slice(0, 10)
}

export type DispatchRow = {
  orderItemId: string; name: string; restaurantName: string; qty: number; unit: string
  checkStage: number; batchId: string; batchStatus: string; canManage: boolean; unitPrice: number; excluded?: boolean
}
export type DispatchResponse = {
  businessDate: string; totalAmount: number
  totals: Array<{ productId: string; name: string; qtyText: string; unit: string; amount: number }>
  garakItems: DispatchRow[]
  suppliers: Array<{
    supplierId: string; supplierName: string; sent: boolean; autoDispatchExcluded: boolean
    lines: Array<{ name: string; unit: string; qtyText: string; rows: DispatchRow[] }>
  }>
  unmappedItems: Array<{ name: string; unit: string; qtyText: string }>
}
