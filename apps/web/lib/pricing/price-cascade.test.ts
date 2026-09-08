import { describe, it, expect } from 'vitest'
import { isMultiUnitProduct, rowsToReprice } from './price-cascade'

describe('isMultiUnitProduct', () => {
  it('단위가 하나뿐이면 다단위가 아니다', () => {
    expect(isMultiUnitProduct('box', ['box'])).toBe(false)
    expect(isMultiUnitProduct('kg', null)).toBe(false)
  })
  it('kg 과 bag 을 같이 쓰는 양파는 다단위다', () => {
    expect(isMultiUnitProduct('kg', ['kg', 'bag'])).toBe(true)
  })
})

describe('rowsToReprice', () => {
  const rows = [
    { id: 'kg1', unit: 'kg' },
    { id: 'kg2', unit: 'kg' },
    { id: 'bag1', unit: 'bag' },
    { id: 'box_ko', unit: '박스' },
  ]

  it('다단위 품목은 등록한 단위의 줄만 고친다 — 양파 bag 단가가 kg 줄을 덮으면 안 된다', () => {
    expect(rowsToReprice(rows, 'bag', true)).toEqual(['bag1'])
  })

  it('다단위 품목의 kg 단가는 kg 줄만 고친다', () => {
    expect(rowsToReprice(rows, 'kg', true)).toEqual(['kg1', 'kg2'])
  })

  it('한글로 남은 옛 단위도 코드로 맞춰 고른다', () => {
    expect(rowsToReprice(rows, 'box', true)).toEqual(['box_ko'])
  })

  it('단위가 하나뿐인 품목은 표기가 어긋나도 전부 고친다 — 미나리가 옛 단가에 멈췄던 사고', () => {
    expect(rowsToReprice(rows, 'box', false)).toEqual(['kg1', 'kg2', 'bag1', 'box_ko'])
  })

  it('단위가 비어 있는 줄은 다단위 품목에서 건드리지 않는다', () => {
    expect(rowsToReprice([{ id: 'x', unit: null }], 'kg', true)).toEqual([])
  })
})
