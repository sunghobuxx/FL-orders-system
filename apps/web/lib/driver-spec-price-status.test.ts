import { describe, expect, it } from 'vitest'
import { priceStatusText, priceStatusPrintText, type SpecPriceStatus } from '../../driver-mobile/lib/price-status'
import { createSpecHtml, type PrintableSpec } from '../../driver-mobile/lib/spec-print'
import { priceStatusText as webText, priceStatusPrintText as webPrintText } from './pricing/price-status'

const cases: Array<[SpecPriceStatus, string]> = [
  [{ status: 'pending', at: null }, '단가 입력 중 · 금액이 바뀔 수 있습니다 (이전 단가 기준)'],
  [{ status: 'confirmed', at: '2026-09-24T04:10:00+00:00' }, '✓ 당일 단가 확정 (13:10)'],
  [{ status: 'confirmed', at: null }, '✓ 당일 단가 확정'],
  [{ status: 'modified', at: '2026-09-24T04:40:00Z' }, '단가 수정됨 · 금액이 바뀔 수 있습니다 (13:40 수정)'],
  [{ status: 'final', at: null }, '정산 확정'],
]
const spec: PrintableSpec = {
  id: 'old-spec', businessDate: '2026-09-24', restaurantName: '테스트 & 식당',
  totalAmount: 2000, previousOutstanding: 0, outstanding: 2000, itemCount: 1,
  lines: [{ id: 'line', productName: '사과', qty: 2, unit: '개', unitPrice: 1000, amount: 2000 }],
}

describe('배송앱 명세서 단가 상태', () => {
  it.each(cases)('웹과 동일한 목록 문구: %j', (value, expected) => {
    expect(priceStatusText(value)).toBe(expected)
    expect(priceStatusText(value)).toBe(webText(value))
    expect(priceStatusPrintText(value)).toBe(webPrintText(value))
  })
  it.each(cases.filter(([s]) => s.status !== 'final'))('제목 바로 아래에 인쇄 문구: %j', (value, expected) => {
    const html = createSpecHtml({ ...spec, priceStatus: value })
    expect(html).toContain(`<h2>9월 24일 발주 명세표</h2>\n      <p class="price-status">${expected}</p>`)
    expect(html).toContain('테스트 &amp; 식당')
    expect(html).toContain('사과')
  })
  it.each([undefined, null, { status: 'final', at: null } as SpecPriceStatus])('상태 없음/정산 확정은 인쇄하지 않는다: %j', value => {
    expect(createSpecHtml({ ...spec, priceStatus: value })).not.toContain('<p class="price-status">')
  })
  it('오래된 미확정 날짜도 인쇄한다', () => {
    const html = createSpecHtml({ ...spec, businessDate: '2020-01-01', priceStatus: { status: 'pending', at: null } })
    expect(html).toContain('<p class="price-status">단가 입력 중')
  })
  it('UTC 자정을 넘어가는 시각도 KST로 변환한다', () => {
    expect(priceStatusText({ status: 'confirmed', at: '2026-09-24T18:05:00Z' })).toBe('✓ 당일 단가 확정 (03:05)')
  })
  it('상태가 없는 구버전 응답은 배지를 표시하지 않는다', () => {
    expect(priceStatusText()).toBeNull()
    expect(priceStatusText(null)).toBeNull()
  })
  it('잘못된 시각으로 명세서 인쇄가 중단되지 않는다', () => {
    expect(priceStatusPrintText({ status: 'modified', at: 'invalid' })).toBe('단가 수정됨 · 금액이 바뀔 수 있습니다')
  })
})
