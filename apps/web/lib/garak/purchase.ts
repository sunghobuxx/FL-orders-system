export interface GarakPurchaseInput {
  businessDate?: string
  productId?: string
  unit?: string
  qty?: number
  unitPrice?: number
  salePrice?: number
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 가락 매입 입력 검증. 통과하면 null, 아니면 사람이 읽을 오류 문구. */
export function validateGarakPurchase(input: GarakPurchaseInput): string | null {
  if (!input.businessDate || !DATE_RE.test(input.businessDate)) return '날짜를 입력하세요'
  if (!input.productId) return '품목을 고르세요'
  if (!input.unit?.trim()) return '단위를 입력하세요'
  if (typeof input.qty !== 'number' || !Number.isFinite(input.qty) || input.qty <= 0) return '수량은 0보다 커야 합니다'
  if (typeof input.unitPrice !== 'number' || !Number.isFinite(input.unitPrice) || input.unitPrice < 0) return '매입가를 확인하세요'
  if (typeof input.salePrice !== 'number' || !Number.isFinite(input.salePrice) || input.salePrice < 0) return '공급가를 확인하세요'
  return null
}
