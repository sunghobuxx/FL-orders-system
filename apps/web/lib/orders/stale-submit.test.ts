import { describe, it, expect } from 'vitest'
import { isStaleOrderSubmit } from './stale-submit'

/**
 * 2026-09-11 일산킨텍스: 제출 뒤 뒤로 가기로 돌아온 빈 발주서에서 꽃상추 하나만 보내,
 * 앞서 넣은 품목이 전부 지워졌다(오발주). 화면이 "발주가 아직 없다" 고 믿고 보낸 제출은
 * 그 화면이 낡았다는 뜻이므로 막는다.
 */
describe('isStaleOrderSubmit', () => {
  it('화면은 발주가 없다는데 서버에는 이미 있으면 낡은 화면이다', () => {
    expect(isStaleOrderSubmit({ declaresOrderState: true, clientOrderId: null, serverOrderId: 'ord-1' }))
      .toBe(true)
  })

  it('화면이 아는 발주와 서버의 최신 발주가 같으면 정상', () => {
    expect(isStaleOrderSubmit({ declaresOrderState: true, clientOrderId: 'ord-1', serverOrderId: 'ord-1' }))
      .toBe(false)
  })

  it('화면이 다른 발주를 알고 있으면 낡은 화면이다', () => {
    expect(isStaleOrderSubmit({ declaresOrderState: true, clientOrderId: 'ord-0', serverOrderId: 'ord-1' }))
      .toBe(true)
  })

  it('서버에도 발주가 없으면 첫 제출이라 정상', () => {
    expect(isStaleOrderSubmit({ declaresOrderState: true, clientOrderId: null, serverOrderId: null }))
      .toBe(false)
  })

  it('발주 상태를 안 알려주는 화면(구버전 앱)은 막지 않는다 — 앱이 고쳐질 때까지', () => {
    expect(isStaleOrderSubmit({ declaresOrderState: false, clientOrderId: null, serverOrderId: 'ord-1' }))
      .toBe(false)
  })
})
