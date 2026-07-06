// 발주 전송 타입

export type DispatchChannel = 'kakao' | 'sms'
export type DispatchStatus = 'pending' | 'sent' | 'failed' | 'cancelled'

export interface DispatchJob {
  id: string
  supplier_id: string
  business_date: string
  status: DispatchStatus
  idempotency_key: string     // 중복 발송 방지
  created_at: string
  updated_at: string
}

export interface DispatchJobItem {
  id: string
  dispatch_job_id: string
  order_item_id: string
  qty: number
}

export interface DispatchMessage {
  id: string
  dispatch_job_id: string
  channel: DispatchChannel
  template_id: string | null
  external_message_id: string | null
  status: DispatchStatus
  sent_at: string | null
  created_at: string
}

export interface DispatchReport {
  id: string
  dispatch_message_id: string
  provider_status: string
  delivered_at: string | null
  payload_json: unknown
  created_at: string
}
