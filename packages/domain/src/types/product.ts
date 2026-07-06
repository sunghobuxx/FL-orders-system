// 거래처 / 품목 마스터 타입

export type ProductUnit = 'kg' | 'g' | 'box' | 'ea' | 'bag' | 'pack' | 'bottle'

export type ProductCategory =
  | 'vegetable'   // 채소
  | 'fruit'       // 과일
  | 'meat'        // 육류
  | 'seafood'     // 수산
  | 'grain'       // 곡류
  | 'dairy'       // 유제품
  | 'seasoning'   // 양념/조미료
  | 'etc'

export interface Product {
  id: string
  sku: string
  standard_name: string
  category: ProductCategory
  default_unit: ProductUnit
  allowed_units: ProductUnit[]
  taxable_flag: boolean
  image_path: string | null  // Storage 경로 (관리자 등록)
  is_kg_based: boolean       // kg당 단가 기준 여부
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export interface ProductAlias {
  id: string
  product_id: string
  alias_text: string          // 비정형 명칭 (문자/OCR 등에서 들어오는 텍스트)
  source_scope: string | null // 특정 식당/공급처 한정 별칭이면 해당 id
  created_at: string
}

export interface Supplier {
  id: string
  organization_id: string
  dispatch_channel: 'kakao' | 'sms' | 'email'
  settlement_terms_id: string
  status: 'active' | 'inactive'
  created_at: string
}

export interface SupplierProduct {
  id: string
  supplier_id: string
  product_id: string
  supplier_name: string       // 공급처에서 부르는 품목명
  purchase_unit: ProductUnit
  status: 'active' | 'inactive'
}

export interface PriceSnapshot {
  id: string
  supplier_product_id: string
  sale_price: number          // 식당에 청구하는 판매가 (원)
  purchase_price: number      // 공급처에서 매입하는 가격 (원)
  unit: ProductUnit
  effective_from: string      // 유효 시작일 (YYYY-MM-DD)
  created_at: string
}

export interface BillingTerms {
  id: string
  cycle_type: 'weekly' | 'monthly'
  due_rule: string            // 예: "closing+7d"
  vat_rule: 'included' | 'excluded'
  created_at: string
}
