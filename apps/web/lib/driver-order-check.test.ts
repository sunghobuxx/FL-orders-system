import { describe, expect, it } from 'vitest'
import { nextOrderCheckStage, orderCheckState } from '../../driver-mobile/lib/order-check'

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
