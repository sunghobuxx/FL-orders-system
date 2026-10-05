import { describe, expect, it } from 'vitest'
import { allocationWarning, isEligibleAddress, sortCandidates } from './allocation'

describe('가락 배정', () => {
  it('서울·일산 주소는 배정 후보에서 뺀다', () => {
    expect(isEligibleAddress('서울 송파구 가락동 1')).toBe(false)
    expect(isEligibleAddress('경기 고양시 일산동구 태극로 11')).toBe(false)
    expect(isEligibleAddress('경기 수원시 영통구')).toBe(true)
  })

  it('수량이 같은 줄을 먼저 보여 준다', () => {
    const sorted = sortCandidates([
      { orderItemId: 'a', restaurantName: '고강점', qty: 5, unit: 'kg' },
      { orderItemId: 'b', restaurantName: '수원대점', qty: 2, unit: 'kg' },
    ], 2)
    expect(sorted[0].orderItemId).toBe('b')
    expect(sorted[0].exact).toBe(true)
  })

  it('수량이 다르면 경고, 같으면 경고 없음', () => {
    expect(allocationWarning(2, 5)).toContain('다릅니다')
    expect(allocationWarning(2, 2)).toBeNull()
  })
})
