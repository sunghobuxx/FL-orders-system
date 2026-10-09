export function defaultDispatchDate(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  if (kst.getUTCHours() >= 18) kst.setUTCDate(kst.getUTCDate() + 1)
  return kst.toISOString().slice(0, 10)
}

export type DispatchRow = {
  productId?: string; supplierId?: string; supplierName?: string
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

// Match web DispatchQtyEditor (supplier = loading only) and GarakCheckList.
export function dispatchCheckState(row: DispatchRow, source: 'garak' | 'suppliers') {
  const required = source === 'suppliers' ? 1 : ['ordered', 'dispatched', 'completed'].includes(row.batchStatus) ? 2 : 1
  const checked = row.checkStage >= required
  const disabled = source === 'suppliers' && row.checkStage >= 2
  return { checked, disabled, next: disabled ? null : checked ? required - 1 : required,
    label: checked ? '✓' : source === 'suppliers' ? '확인' : required === 1 ? '상차' : '배송' }
}

export function updateDispatchCheck(data: DispatchResponse, itemId: string, stage: number, result?: { batchId: string; batchStatus: string }) {
  const rank: Record<string, number> = { open: 0, submitted: 1, validated: 2, ordered: 3, dispatched: 4, completed: 5 }
  const update = (row: DispatchRow): DispatchRow => ({ ...row,
    checkStage: row.orderItemId === itemId ? stage : row.checkStage,
    batchStatus: result && row.batchId === result.batchId && (rank[result.batchStatus] ?? 0) >= (rank[row.batchStatus] ?? 0) ? result.batchStatus : row.batchStatus,
  })
  return { ...data, garakItems: data.garakItems.map(update), suppliers: data.suppliers.map(supplier => ({ ...supplier,
    lines: supplier.lines.map(line => ({ ...line, rows: line.rows.map(update) })),
  })) }
}

/** Same supplier → product/unit → restaurant hierarchy as the web Garak list. */
export function groupGarakRows(rows: DispatchRow[]) {
  const suppliers = new Map<string, { supplierId: string; supplierName: string; lines: Map<string, { key: string; name: string; unit: string; qty: number; rows: DispatchRow[] }> }>()
  for (const row of rows) {
    const supplierId = row.supplierId || 'unassigned'
    const supplier = suppliers.get(supplierId) ?? { supplierId, supplierName: row.supplierName || '미지정', lines: new Map() }
    const key = `${row.productId || row.name}:${row.unit}`
    const line = supplier.lines.get(key) ?? { key, name: row.name, unit: row.unit, qty: 0, rows: [] }
    line.qty += row.qty
    line.rows.push(row)
    supplier.lines.set(key, line)
    suppliers.set(supplierId, supplier)
  }
  return [...suppliers.values()].map(supplier => ({ ...supplier, lines: [...supplier.lines.values()] }))
}
