import { describe, expect, it } from 'vitest'
import { isSeoulAddress } from './region'

describe('isSeoulAddress', () => {
  it('주소가 "서울"로 시작하면 true', () => {
    expect(isSeoulAddress('서울 송파구 가락동 123')).toBe(true)
    expect(isSeoulAddress('서울특별시 강남구 역삼동')).toBe(true)
  })

  it('앞뒤 공백은 무시한다', () => {
    expect(isSeoulAddress('  서울 송파구')).toBe(true)
  })

  it('서울이 아닌 주소는 false', () => {
    expect(isSeoulAddress('경기도 수원시 영통구')).toBe(false)
    expect(isSeoulAddress('인천광역시 부평구')).toBe(false)
  })

  it('비어있거나 없으면 false', () => {
    expect(isSeoulAddress(null)).toBe(false)
    expect(isSeoulAddress(undefined)).toBe(false)
    expect(isSeoulAddress('')).toBe(false)
  })
})
