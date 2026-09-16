import { describe, it, expect } from 'vitest'
import { toPackQty, type PackSpec } from './pack-size'

const 양파: PackSpec = { pack_unit: 'bag', kg_per_pack: 15 }
const 고추: PackSpec = { pack_unit: 'box', kg_per_pack: 10 }

describe('toPackQty', () => {
  it('규격의 배수면 포장 단위로 바꾼다', () => {
    expect(toPackQty(15, 'kg', 양파)).toEqual({ qty: 1, unit: 'bag' })
    expect(toPackQty(30, 'kg', 양파)).toEqual({ qty: 2, unit: 'bag' })
    expect(toPackQty(45, 'kg', 양파)).toEqual({ qty: 3, unit: 'bag' })
    expect(toPackQty(10, 'kg', 고추)).toEqual({ qty: 1, unit: 'box' })
    expect(toPackQty(20, 'kg', 고추)).toEqual({ qty: 2, unit: 'box' })
  })

  it('배수가 아니면 그대로 둔다 — 낱개로 시킨 것이다', () => {
    expect(toPackQty(3, 'kg', 양파)).toBeNull()
    expect(toPackQty(8, 'kg', 양파)).toBeNull()
    expect(toPackQty(20, 'kg', 양파)).toBeNull()
    expect(toPackQty(15.5, 'kg', 양파)).toBeNull()
  })

  it('이미 포장 단위로 시켰으면 건드리지 않는다', () => {
    expect(toPackQty(1, 'bag', 양파)).toBeNull()
    expect(toPackQty(15, 'box', 고추)).toBeNull()
  })

  it('규격이 없는 품목은 건드리지 않는다', () => {
    expect(toPackQty(15, 'kg', null)).toBeNull()
    expect(toPackQty(15, 'kg', { pack_unit: null, kg_per_pack: null })).toBeNull()
    expect(toPackQty(15, 'kg', { pack_unit: 'bag', kg_per_pack: 0 })).toBeNull()
  })

  it('수량이 0 이하이거나 단위가 없으면 건드리지 않는다', () => {
    expect(toPackQty(0, 'kg', 양파)).toBeNull()
    expect(toPackQty(-15, 'kg', 양파)).toBeNull()
    expect(toPackQty(15, null, 양파)).toBeNull()
  })

  it('포장 단위가 kg 이면 바꿀 것이 없다', () => {
    expect(toPackQty(15, 'kg', { pack_unit: 'kg', kg_per_pack: 15 })).toBeNull()
  })

  it('품목명을 함께 넘겨도 변환은 그대로 된다 — 청양고추 박스 단가 80,000 확인됨(2026-09-11)', () => {
    expect(toPackQty(10, 'kg', { ...고추, standard_name: '청양고추' })).toEqual({ qty: 1, unit: 'box' })
  })
})
