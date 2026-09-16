import { describe, expect, it } from 'vitest'
import { orderFingerprint, shouldKeepDraft, progressStep } from '../../mobile/lib/order-state'
import { statementHtml } from '../../mobile/lib/statement'
import { settlementPeriod, unpaidBalance, validDate } from './member-settlement'
import { mobilePaymentReturn } from './mobile-payment-return'

describe('주문앱 웹 동작 회귀 검사', () => {
  it('작성 중 입력은 자동 조회로 덮어쓰지 않는다', () => {
    expect(shouldKeepDraft(true, false)).toBe(true)
    expect(shouldKeepDraft(true, true)).toBe(false)
    expect(shouldKeepDraft(false, false)).toBe(false)
  })
  it('수량·단위·날짜·발주 ID 변경을 모두 감지한다', () => {
    const base = { businessDate: '2026-09-15', orderId: 'o1', quantities: { p1: '2' }, units: { p1: 'kg' } }
    for (const changed of [{ orderId: 'o2' }, { orderId: null }, { businessDate: '2026-09-16' }, { quantities: { p1: '3' } }, { units: { p1: 'box' } }]) {
      expect(orderFingerprint({ ...base, ...changed })).not.toBe(orderFingerprint(base))
    }
    expect(orderFingerprint({ ...base, quantities: { p1: '2.0' } })).toBe(orderFingerprint(base))
  })
  it('배송완료 상태를 마지막 단계로 표시한다', () => {
    expect(progressStep('completed')).toBe(3)
    expect(progressStep('dispatched')).toBe(3)
    expect(progressStep('submitted')).toBe(0)
  })
  it('존재하지 않는 날짜를 거절한다', () => {
    expect(validDate('2026-02-29')).toBe(false)
    expect(validDate('2026-13-01')).toBe(false)
    expect(validDate('2024-02-29')).toBe(true)
  })
  it('주간·월간 경계를 웹 기준으로 계산한다', () => {
    expect(settlementPeriod('2026-09-20', true)).toMatchObject({ start: '2026-09-14', end: '2026-09-20' })
    expect(settlementPeriod('2026-09-15', false)).toMatchObject({ start: '2026-09-01', end: '2026-09-30' })
  })
  it('부분 납부 후 잔액만 결제 대상으로 삼는다', () => {
    expect(unpaidBalance({ status: 'partial', balance: '4000' })).toBe(4000)
    expect(unpaidBalance({ status: 'paid', balance: 10000 })).toBe(0)
    expect(unpaidBalance({ status: 'unpaid', balance: -100 })).toBe(0)
  })
  it('인쇄 HTML은 업체명/품목명을 escape한다', () => {
    const html = statementHtml('<script>bad</script>', [{ id: 's', business_date: '2026-09-15', total_amount: 2000 }], [{ id: 'l', specId: 's', name: '<img src=x>', qty: 2, unit: 'box', unitPrice: 1000, amount: 2000 }], 500)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;img src=x&gt;')
    expect(html).toContain('1,000원')
  })
  it('로그인 후 결제 복귀는 내부 결제 경로만 허용한다', () => {
    expect(mobilePaymentReturn('/member/payment?amount=4000')).toBe('/member/payment?amount=4000')
    for (const value of [null, '//evil.test/member/payment?x', 'https://evil.test', '/admin/dashboard', '/member/payment/evil?x', '/member/payment?x\n']) expect(mobilePaymentReturn(value)).toBeNull()
  })
})
