import { describe, it, expect } from 'vitest'
import { CATEGORY_ORDER, categoryLabel, normalizeCategory, SUBCATEGORIES } from './categories'

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
