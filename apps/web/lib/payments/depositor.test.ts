import { describe, expect, it } from 'vitest'
import { normalizeDepositor } from './depositor'

describe('normalizeDepositor', () => {
  it('공백·기호를 지우고 소문자로 만든다', () => {
    expect(normalizeDepositor(' 김 성호 ')).toBe('김성호')
    expect(normalizeDepositor('KIM Sung-Ho')).toBe('kimsungho')
    expect(normalizeDepositor('홍길동(1234)')).toBe('홍길동1234')
  })

  it('법인 표기는 지운다: (주), ㈜, 주식회사, (유), 유한회사', () => {
    expect(normalizeDepositor('(주)맛승')).toBe('맛승')
    expect(normalizeDepositor('㈜ 맛승')).toBe('맛승')
    expect(normalizeDepositor('주식회사맛승')).toBe('맛승')
    expect(normalizeDepositor('맛승(유)')).toBe('맛승')
    expect(normalizeDepositor('맛승유한회사')).toBe('맛승')
  })

  it('전각 문자를 반각으로 맞춘다(NFKC)', () => {
    expect(normalizeDepositor('ＡＢＣ１２３')).toBe('abc123')
  })

  it('없거나 비어 있으면 빈 문자열', () => {
    expect(normalizeDepositor(null)).toBe('')
    expect(normalizeDepositor(undefined)).toBe('')
    expect(normalizeDepositor('   ')).toBe('')
  })

  it('법인 표기만 있는 이름은 지운 결과가 비므로 기호만 지운 원문을 돌려준다(빈 별칭을 만들지 않는다)', () => {
    expect(normalizeDepositor('주식회사')).toBe('주식회사')
    expect(normalizeDepositor('(주)')).toBe('주')
  })

  it('이름이 달라지면 결과도 다르다(과도한 정규화로 서로 다른 사람이 합쳐지지 않는다)', () => {
    expect(normalizeDepositor('김성호')).not.toBe(normalizeDepositor('김성오'))
  })
})
