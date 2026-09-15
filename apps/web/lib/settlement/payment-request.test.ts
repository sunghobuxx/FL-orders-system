import { describe, it, expect } from 'vitest'
import { buildPaymentRequestMessage, paymentRequestAmount, pickRequestPhone } from './payment-request'

describe('paymentRequestAmount', () => {
  it('이 정산서 남은 금액 + 이전 미수금을 요청한다', () => {
    expect(paymentRequestAmount({ outstanding: 508500, carryover: 521000 })).toBe(1029500)
  })

  it('일부 입금된 정산서는 남은 금액만 요청한다 — 청구 총액이 아니다', () => {
    // 세류점 9/06~12: 청구 508,500 중 507,500 입금 → 1,000 만 남음
    expect(paymentRequestAmount({ outstanding: 1000, carryover: 0 })).toBe(1000)
  })

  it('받을 돈이 없으면 0 — 이미 받은 곳에는 요청하지 않는다', () => {
    expect(paymentRequestAmount({ outstanding: 0, carryover: 0 })).toBe(0)
  })
})

describe('pickRequestPhone', () => {
  it('대표 연락처를 먼저 쓴다', () => {
    expect(pickRequestPhone([
      { phone: '01011112222', is_primary: false },
      { phone: '010-3333-4444', is_primary: true },
    ])).toBe('010-3333-4444')
  })

  it('휴대폰 번호가 아니면 건너뛴다', () => {
    expect(pickRequestPhone([
      { phone: '031-123-4567', is_primary: true },
      { phone: '01055556666', is_primary: false },
    ])).toBe('01055556666')
  })

  it('쓸 번호가 없으면 null', () => {
    expect(pickRequestPhone([{ phone: '02-123-4567', is_primary: true }])).toBeNull()
    expect(pickRequestPhone([])).toBeNull()
  })
})

describe('buildPaymentRequestMessage', () => {
  it('업체명·기간·요청액·정산서 링크를 담는다 — 계좌번호는 넣지 않는다', () => {
    const text = buildPaymentRequestMessage({
      orgName: '할매솥뚜껑삼겹살 세류점',
      start: '2026-09-06', end: '2026-09-12',
      amount: 1029500,
      shareUrl: 'https://order.fruitlife.shop/s/abc',
    })
    expect(text).toContain('[FruitLife] 입금 요청 안내')
    // 인사말로 시작하고, 부탁하는 말투여야 한다 (사장님 요청, 2026-09-15)
    expect(text).toContain('안녕하세요, 할매솥뚜껑삼겹살 세류점 사장님.')
    expect(text).toContain('감사')
    expect(text).toContain('부탁드리겠습니다')
    // 이미 입금한 곳이 불쾌하지 않게
    expect(text).toContain('이미 입금해 주셨다면')
    expect(text).toContain('할매솥뚜껑삼겹살 세류점')
    expect(text).toContain('2026.09.06 ~ 09.12')
    expect(text).toContain('1,029,500원')
    expect(text).toContain('https://order.fruitlife.shop/s/abc')
    expect(text).not.toMatch(/계좌|예금주|\d{3}-\d{4}-\d{4}-\d{2}/)
  })
})
