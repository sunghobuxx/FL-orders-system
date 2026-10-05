import { describe, expect, it } from 'vitest'
import { pickMessageSource } from './message-source'

describe('pickMessageSource', () => {
  it('확정 줄이 있으면 그걸로 보낸다', () => {
    expect(pickMessageSource({ confirmedLineCount: 2, snapshotRowCount: 2 })).toBe('confirmed')
  })

  it('줄은 있는데 전부 제외됐으면 아무것도 보내지 않는다 (수정한 수량이 되살아나지 않게)', () => {
    expect(pickMessageSource({ confirmedLineCount: 0, snapshotRowCount: 1 })).toBe('none')
  })

  it('확정 줄 자체가 없을 때만 발주 원본으로 되돌린다', () => {
    expect(pickMessageSource({ confirmedLineCount: 0, snapshotRowCount: 0 })).toBe('order')
  })
})
