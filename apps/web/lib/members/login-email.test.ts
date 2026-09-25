import { describe, expect, it } from 'vitest'
import { validateLoginEmail } from './login-email'

describe('validateLoginEmail — 매출 업체는 로그인 이메일이 있어야 등록된다', () => {
  it('매출 업체(restaurant)는 이메일이 없으면 등록할 수 없다', () => {
    for (const empty of [undefined, null, '', '   ']) {
      const r = validateLoginEmail('restaurant', empty)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toContain('이메일')
    }
  })

  it('이메일 형식이 아니면 등록할 수 없다', () => {
    for (const bad of ['lsc4407', 'lsc4407@', '@gmail.com', 'a b@gmail.com', 'lsc4407@gmail']) {
      expect(validateLoginEmail('restaurant', bad).ok).toBe(false)
    }
  })

  it('앞뒤 공백은 걷고 소문자로 맞춘다 — 계정 생성·users 저장이 같은 값을 쓰도록', () => {
    expect(validateLoginEmail('restaurant', '  LSC4407@Gmail.com ')).toEqual({ ok: true, email: 'lsc4407@gmail.com' })
  })

  it('매입 공급처는 로그인 계정이 필요 없어 이메일을 비워도 된다', () => {
    expect(validateLoginEmail('supplier', undefined)).toEqual({ ok: true, email: null })
    expect(validateLoginEmail('supplier', '  ')).toEqual({ ok: true, email: null })
  })

  it('매입 공급처도 이메일을 적었다면 형식은 맞아야 한다', () => {
    expect(validateLoginEmail('supplier', 'oops').ok).toBe(false)
    expect(validateLoginEmail('supplier', 'a@b.co')).toEqual({ ok: true, email: 'a@b.co' })
  })
})
