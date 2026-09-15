import { describe, it, expect } from 'vitest'
import { formatDispatchLine, type DispatchLine } from './current-items'

const 양파: DispatchLine = {
  name: '양파', qty: 20, unit: 'kg',
  byRestaurant: [
    { name: '할매솥뚜껑삼겹살 고강점', qty: 3 },
    { name: '할매솥뚜껑삼겹살 일산킨텍스점', qty: 15 },
    { name: '할매솥뚜껑삼겹살 정왕점', qty: 2 },
  ],
}

describe('formatDispatchLine — 업체별 수량 표시', () => {
  it('기본은 총합 뒤에 업체별 수량을 붙인다 (지금까지와 같다)', () => {
    expect(formatDispatchLine(양파)).toBe('양파: 20kg (고강점 3kg / 일산킨텍스점 15kg / 정왕점 2kg)')
  })

  it('업체별 표시를 끄면 총합만 쓴다 — 인숙이네처럼 품목·업체가 많은 공급처', () => {
    expect(formatDispatchLine(양파, ': ', { showBreakdown: false })).toBe('양파: 20kg')
  })

  it('업체가 하나뿐이면 설정과 무관하게 총합만 쓴다', () => {
    const 한곳: DispatchLine = { name: '대파', qty: 10, unit: 'ea', byRestaurant: [{ name: '세류점', qty: 10 }] }
    expect(formatDispatchLine(한곳)).toBe('대파: 10ea')
    expect(formatDispatchLine(한곳, ': ', { showBreakdown: true })).toBe('대파: 10ea')
  })
})
