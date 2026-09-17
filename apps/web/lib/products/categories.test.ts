import { describe, it, expect } from 'vitest'
import { CATEGORY_ORDER, categoryLabel, groupBySubcategory, normalizeCategory, SUBCATEGORIES } from './categories'

describe('normalizeCategory — 옛 분류값도 읽힌다', () => {
  it('육류·유제품은 축산으로 합친다', () => {
    expect(normalizeCategory('meat')).toBe('livestock')
    expect(normalizeCategory('dairy')).toBe('livestock')
  })

  it('옛 기타는 기타식품으로 본다', () => {
    expect(normalizeCategory('etc')).toBe('misc')
  })

  it('새 분류는 그대로 둔다', () => {
    for (const c of ['vegetable', 'fruit', 'livestock', 'seafood', 'grain', 'seasoning', 'frozen', 'misc', 'supply']) {
      expect(normalizeCategory(c)).toBe(c)
    }
  })

  it('비어 있거나 모르는 값은 기타식품으로 — 화면에서 사라지면 안 된다', () => {
    expect(normalizeCategory(null)).toBe('misc')
    expect(normalizeCategory('')).toBe('misc')
    expect(normalizeCategory('무엇인가')).toBe('misc')
  })
})

describe('분류 목록', () => {
  it('대분류는 9개이고 야채가 먼저다', () => {
    expect(CATEGORY_ORDER).toHaveLength(9)
    expect(CATEGORY_ORDER[0]).toBe('vegetable')
  })

  it('이름표가 모두 있다', () => {
    for (const c of CATEGORY_ORDER) expect(categoryLabel(c)).not.toBe(c)
  })

  it('소분류는 대분류마다 있다', () => {
    for (const c of CATEGORY_ORDER) expect(SUBCATEGORIES[c].length).toBeGreaterThan(0)
  })
})

describe('groupBySubcategory — 대분류 안에서 소분류로 묶는다', () => {
  const P = (name: string, subcategory: string | null) => ({ name, subcategory })

  it('소분류 정해진 순서대로 묶는다', () => {
    const g = groupBySubcategory('vegetable', [
      P('무', '근채류'), P('깻잎', '엽채류'), P('팽이', '버섯류'), P('대파', '근채류'),
    ])
    expect(g.map(x => x.subcategory)).toEqual(['엽채류', '근채류', '버섯류'])
    expect(g[1].items.map(i => i.name)).toEqual(['무', '대파'])
  })

  it('소분류가 없거나 모르는 값이면 맨 뒤 「기타」로 모은다', () => {
    const g = groupBySubcategory('vegetable', [P('깻잎', '엽채류'), P('???', null), P('신품목', '없는분류')])
    expect(g.map(x => x.subcategory)).toEqual(['엽채류', '기타'])
    expect(g[1].items).toHaveLength(2)
  })

  it('한 소분류뿐이면 묶음 하나', () => {
    expect(groupBySubcategory('fruit', [P('사과', '과일'), P('배', '과일')])).toHaveLength(1)
  })

  it('빈 목록은 빈 결과', () => {
    expect(groupBySubcategory('vegetable', [])).toEqual([])
  })
})
