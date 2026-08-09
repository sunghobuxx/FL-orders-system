import { describe, it, expect } from 'vitest'
import { buildAddable, canMemberRemove, type CatalogProduct } from './self-add'

const all: CatalogProduct[] = [
  { id: 'p1', standard_name: '깻잎',   category: 'vegetable', default_unit: 'box' },
  { id: 'p2', standard_name: '사과',   category: 'fruit',     default_unit: 'box' },
  { id: 'p3', standard_name: '시금치', category: 'vegetable', default_unit: 'ea' },
]

describe('buildAddable', () => {
  it('이미 내 목록에 있는 품목은 뺀다', () => {
    const got = buildAddable(all, new Set(['p1']), new Set(), new Map([['p2', 5000], ['p3', 3000]]))
    expect(got.map(p => p.id)).toEqual(['p2', 'p3'])
  })

  it('단가가 있으면 needsApproval 이 false 고 금액이 붙는다', () => {
    const got = buildAddable(all, new Set(), new Set(), new Map([['p1', 27000]]))
    const p1 = got.find(p => p.id === 'p1')!
    expect(p1.price).toBe(27000)
    expect(p1.needsApproval).toBe(false)
  })

  it('단가가 없으면 needsApproval 이 true 고 금액은 null — 0 원으로 보이면 안 된다', () => {
    const got = buildAddable(all, new Set(), new Set(), new Map())
    const p2 = got.find(p => p.id === 'p2')!
    expect(p2.price).toBeNull()
    expect(p2.needsApproval).toBe(true)
  })

  it('단가가 0 이면 없는 것으로 본다 — 0 원 명세서가 나가면 안 된다', () => {
    const got = buildAddable(all, new Set(), new Set(), new Map([['p2', 0]]))
    const p2 = got.find(p => p.id === 'p2')!
    expect(p2.price).toBeNull()
    expect(p2.needsApproval).toBe(true)
  })

  it('이미 요청해 둔 품목은 목록에서 뺀다 — 두 번 요청하면 헷갈린다', () => {
    const got = buildAddable(all, new Set(), new Set(['p2']), new Map())
    expect(got.map(p => p.id)).toEqual(['p1', 'p3'])
  })

  it('분류 없는 품목도 빠뜨리지 않는다', () => {
    const odd: CatalogProduct[] = [{ id: 'p9', standard_name: '기타', category: null, default_unit: 'ea' }]
    const got = buildAddable(odd, new Set(), new Set(), new Map([['p9', 1000]]))
    expect(got.map(p => p.id)).toEqual(['p9'])
  })
})

describe('canMemberRemove', () => {
  it('회원이 넣은 것은 뺄 수 있다', () => {
    expect(canMemberRemove('member')).toBe(true)
  })

  it('관리자가 넣은 기본 품목은 못 뺀다', () => {
    expect(canMemberRemove('admin')).toBe(false)
  })

  it('값이 없으면 관리자 것으로 보고 못 빼게 한다 — 안전한 쪽으로', () => {
    expect(canMemberRemove('')).toBe(false)
  })
})
