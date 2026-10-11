import { describe, expect, it } from 'vitest'
import { nextOrderCheckStage, orderCheckState, pendingOrderCheckIds, orderCheckPresentation } from '../../driver-mobile/lib/order-check'

describe('driver order confirmation stages', () => {
  it('confirms loading first and starts delivery confirmation from zero', () => {
    expect(nextOrderCheckStage('validated', 0)).toBe(1)
    const stages = [1, 1, 1]
    expect(stages.filter(s => s >= orderCheckState('validated').requiredStage)).toHaveLength(3)
    expect(stages.filter(s => s >= orderCheckState('ordered').requiredStage)).toHaveLength(0)
    expect(nextOrderCheckStage('ordered', 1)).toBe(2)
  })
  it('unchecks only the current stage, preserving loading confirmation', () => {
    expect(nextOrderCheckStage('validated', 1)).toBe(0)
    expect(nextOrderCheckStage('ordered', 2)).toBe(1)
    expect(nextOrderCheckStage('ordered', 0)).toBe(2)
  })
  it('keeps completed orders confirmed and prevents additional toggles', () => {
    for (const status of ['dispatched', 'completed']) {
      expect(orderCheckState(status)).toMatchObject({ done: true, requiredStage: 2 })
      expect(nextOrderCheckStage(status, 2)).toBeNull()
    }
  })
})

describe('bulk confirmation and visible process state', () => {
  it('completes only the current step without lowering checks already ahead', () => {
    const items = [{ id: 'a', check_stage: 0 }, { id: 'b', check_stage: 1 }, { id: 'c', checkStage: 2 }]
    expect(pendingOrderCheckIds('validated', items)).toEqual(['a'])
    expect(pendingOrderCheckIds('ordered', items)).toEqual(['a', 'b'])
    expect(pendingOrderCheckIds('dispatched', items)).toEqual([])
    expect(pendingOrderCheckIds('completed', items)).toEqual([])
    expect(pendingOrderCheckIds('validated', [])).toEqual([])
  })
  it('gives loading, delivery and completion distinct labels and colors', () => {
    const loading = orderCheckPresentation('validated')
    const delivery = orderCheckPresentation('ordered')
    const done = orderCheckPresentation('dispatched')
    expect(loading.next).toBe('배송중')
    expect(delivery.text).toContain('상차 완료')
    expect(delivery.next).toBe('배송완료')
    expect(done.text).toBe('배송완료')
    expect(new Set([loading.color, delivery.color, done.color]).size).toBe(3)
  })
})
