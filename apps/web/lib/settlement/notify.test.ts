import { describe, it, expect } from 'vitest'
import { pickChannel, buildMessage } from './notify'

describe('pickChannel', () => {
  it('일정산은 보내지 않는다 — 매일 보내면 월 30통이라 문자로는 감당이 안 된다', () => {
    expect(pickChannel({ cycle: 'daily', phone: '01012345678', pushToken: null }))
      .toBe('skip-daily')
  })

  it('일정산은 푸시 토큰이 있어도 이번 범위에서는 보내지 않는다', () => {
    expect(pickChannel({ cycle: 'daily', phone: '01012345678', pushToken: 'tok' }))
      .toBe('skip-daily')
  })

  it('푸시 토큰이 있으면 푸시', () => {
    expect(pickChannel({ cycle: 'weekly', phone: '01012345678', pushToken: 'tok' }))
      .toBe('push')
  })

  it('토큰이 없고 번호가 있으면 알림톡 — 실패 시 문자로 대체되는 것은 발송 모듈이 한다', () => {
    expect(pickChannel({ cycle: 'weekly', phone: '01012345678', pushToken: null }))
      .toBe('kakao')
  })

  it('번호가 없으면 no-contact', () => {
    expect(pickChannel({ cycle: 'monthly', phone: null, pushToken: null }))
      .toBe('no-contact')
  })

  it('번호 형식이 휴대폰이 아니면 no-contact', () => {
    expect(pickChannel({ cycle: 'weekly', phone: '021234567', pushToken: null }))
      .toBe('no-contact')
  })
})

describe('buildMessage', () => {
  it('당기·이전미수금·총액과 링크를 담는다', () => {
    const text = buildMessage({
      orgName: '할매솥뚜껑삼겹살 천호점',
      start: '2026-08-02',
      end: '2026-08-08',
      current: 646800,
      carryover: 0,
      total: 646800,
      shareUrl: 'https://order.fruitlife.shop/s/abc123',
    })
    expect(text).toContain('할매솥뚜껑삼겹살 천호점')
    expect(text).toContain('2026.08.02 ~ 08.08')
    expect(text).toContain('646,800원')
    expect(text).toContain('https://order.fruitlife.shop/s/abc123')
  })

  it('이전 미수금이 있으면 그 줄도 금액이 들어간다', () => {
    const text = buildMessage({
      orgName: '찬란한 아구 강남',
      start: '2026-08-02', end: '2026-08-08',
      current: 1169500, carryover: 504500, total: 1674000,
      shareUrl: 'https://order.fruitlife.shop/s/xyz',
    })
    expect(text).toContain('504,500원')
    expect(text).toContain('1,674,000원')
  })
})
