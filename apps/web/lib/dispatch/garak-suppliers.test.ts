import { describe, expect, it } from 'vitest'
import { isGarakDispatchGroup } from './garak-suppliers'

describe('isGarakDispatchGroup', () => {
  it('가락업체만 막는다', () => {
    expect(isGarakDispatchGroup('garak')).toBe(true)
    expect(isGarakDispatchGroup('common')).toBe(false)
    expect(isGarakDispatchGroup('existing')).toBe(false)
    expect(isGarakDispatchGroup(null)).toBe(false)
  })
})
