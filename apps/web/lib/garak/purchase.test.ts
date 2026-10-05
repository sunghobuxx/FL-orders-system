import { describe, expect, it } from 'vitest'
import { validateGarakPurchase } from './purchase'

const ok = { businessDate: '2026-10-05', productId: 'p1', unit: 'kg', qty: 2, unitPrice: 8000, salePrice: 9000 }

describe('validateGarakPurchase', () => {
  it('정상 입력은 통과', () => {
    expect(validateGarakPurchase(ok)).toBeNull()
  })
  it('날짜 형식이 틀리면 막는다', () => {
    expect(validateGarakPurchase({ ...ok, businessDate: '10/05' })).toBe('날짜를 입력하세요')
  })
  it('수량이 0 이하이면 막는다', () => {
    expect(validateGarakPurchase({ ...ok, qty: 0 })).toBe('수량은 0보다 커야 합니다')
  })
  it('매입가가 음수이면 막는다', () => {
    expect(validateGarakPurchase({ ...ok, unitPrice: -1 })).toBe('매입가를 확인하세요')
  })
  it('공급가가 없으면 막는다', () => {
    expect(validateGarakPurchase({ ...ok, salePrice: undefined })).toBe('공급가를 확인하세요')
  })
  it('품목과 단위가 없으면 막는다', () => {
    expect(validateGarakPurchase({ ...ok, productId: undefined })).toBe('품목을 고르세요')
    expect(validateGarakPurchase({ ...ok, unit: ' ' })).toBe('단위를 입력하세요')
  })
})
