import { describe, expect, it } from 'vitest'
import { isDispatchBlockedDate } from './no-send-days'

describe('isDispatchBlockedDate', () => {
  it('일요일이면 발주 문자를 막는다', () => {
    expect(isDispatchBlockedDate('2026-10-04')).toBe(true)
    expect(isDispatchBlockedDate('2026-10-11')).toBe(true)
  })

  it('토요일·월요일 등 다른 요일은 막지 않는다', () => {
    expect(isDispatchBlockedDate('2026-10-03')).toBe(false)
    expect(isDispatchBlockedDate('2026-10-05')).toBe(false)
  })
})
