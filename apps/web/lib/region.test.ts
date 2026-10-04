import { describe, expect, it } from 'vitest'
import { isGarakAddress } from './region'

describe('isGarakAddress', () => {
  it('서울 주소는 가락 구매 지역', () => {
    expect(isGarakAddress('서울 송파구 가락동 123')).toBe(true)
    expect(isGarakAddress('서울특별시 강남구 역삼동')).toBe(true)
  })

  it('일산(고양시 일산동구·서구)도 가락 구매 지역', () => {
    expect(isGarakAddress('경기 고양시 일산동구 태극로 11')).toBe(true)
    expect(isGarakAddress('경기 고양시 일산서구 중앙로 1')).toBe(true)
  })

  it('앞뒤 공백은 무시한다', () => {
    expect(isGarakAddress('  서울 송파구')).toBe(true)
  })

  it('그 외 지역(고양 덕양구 등 포함)은 false', () => {
    expect(isGarakAddress('경기 수원시 영통구')).toBe(false)
    expect(isGarakAddress('인천광역시 부평구')).toBe(false)
    expect(isGarakAddress('경기 고양시 덕양구 화정동')).toBe(false)
  })

  it('비어있거나 없으면 false', () => {
    expect(isGarakAddress(null)).toBe(false)
    expect(isGarakAddress(undefined)).toBe(false)
    expect(isGarakAddress('')).toBe(false)
  })
})
