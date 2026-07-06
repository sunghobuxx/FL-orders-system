// 채권 / 채무 / 수금 타입

export type BalanceStatus = 'unpaid' | 'partial' | 'paid' | 'overdue'
export type PaymentDirection = 'inbound' | 'outbound'

export interface Receivable {
  id: string
  restaurant_id: string
  statement_id: string
  due_date: string
  balance: number
  status: BalanceStatus
  created_at: string
}

export interface Payable {
  id: string
  supplier_id: string
  statement_id: string
  due_date: string
  balance: number
  status: BalanceStatus
  created_at: string
}

export interface Payment {
  id: string
  target_type: 'receivable' | 'payable'
  target_id: string
  amount: number
  direction: PaymentDirection
  method: 'transfer' | 'cash' | 'card'
  paid_at: string
  receipt_path: string | null // 입금 증빙 파일 Storage 경로
  created_at: string
}
