// 발주 접수 타입

import type { ProductUnit } from './product'

export type OrderBatchStatus =
  | 'open'        // 입력 가능
  | 'submitted'   // 제출 완료
  | 'validated'   // 관리자 검수 완료
  | 'ordered'     // 공급처 발주 완료
  | 'dispatched'  // 배송중
  | 'completed'   // 완료

export type OrderSourceType = 'web' | 'sms' | 'ocr' | 'manual'

export interface OrderBatch {
  id: string
  restaurant_id: string
  business_date: string       // 영업일 (YYYY-MM-DD)
  status: OrderBatchStatus
  submitted_at: string | null
  created_at: string
  updated_at: string
}

export interface Order {
  id: string
  batch_id: string
  order_no: string            // 주문 번호 (표시용)
  source_type: OrderSourceType
  version: number
  created_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  supplier_product_id: string | null
  qty: number                 // 수량 (kg 기준 품목은 소수점 허용)
  unit: ProductUnit
  unit_price_snapshot: number // 주문 시점 단가 고정
  memo: string | null
  created_at: string
}

export interface RawInput {
  id: string
  restaurant_id: string
  channel: 'sms' | 'image' | 'manual'
  raw_text_json: unknown      // 원본 그대로 저장
  received_at: string
}

export interface ParseJob {
  id: string
  raw_input_id: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  parsed_json: unknown | null
  reviewed_by: string | null
  created_at: string
  updated_at: string
}
