import { describe, it, expect } from 'vitest'
import { groupGarakRows, dispatchCheckState, updateDispatchCheck, type DispatchRow, type DispatchResponse } from '../../driver-mobile/lib/dispatch'
const row = (id: string, supplierId: string, unit = 'kg', qty = 2): DispatchRow => ({ orderItemId: id, productId: 'p', name: '양파', supplierId, supplierName: supplierId, restaurantName: id, qty, unit, checkStage: 0, batchId: 'batch', batchStatus: 'validated', canManage: true, unitPrice: 100 })
describe('Garak supplier cards', () => {
  it('groups supplier then product and preserves restaurant rows', () => {
    const groups = groupGarakRows([row('a', 's1'), row('b', 's2'), row('c', 's1')])
    expect(groups.map(g => g.supplierId)).toEqual(['s1', 's2'])
    expect(groups[0].lines[0].qty).toBe(4)
    expect(groups[0].lines[0].rows.map(r => r.restaurantName)).toEqual(['a', 'c'])
  })
  it('does not mix units or different products sharing a name', () => {
    const groups = groupGarakRows([row('a', 's1'), row('b', 's1', 'box'), { ...row('c', 's1'), productId: 'other' }])
    expect(groups[0].lines).toHaveLength(3)
  })
  it('keeps unrouted rows visible under unassigned', () => {
    expect(groupGarakRows([{ ...row('a', ''), supplierName: undefined }])[0].supplierName).toBe('미지정')
  })
  it('shows the check before a server response and can roll back a failed save', () => {
    const original = { garakItems: [row('a', 's1')], suppliers: [] } as unknown as DispatchResponse
    const optimistic = updateDispatchCheck(original, 'a', 1)
    expect(dispatchCheckState(groupGarakRows(optimistic.garakItems)[0].lines[0].rows[0], 'garak').label).toBe('✓')
    const restored = updateDispatchCheck(optimistic, 'a', 0)
    expect(dispatchCheckState(restored.garakItems[0], 'garak').checked).toBe(false)
  })
})
