// 운영 / 감사로그 타입

export interface Notice {
  id: string
  audience_type: 'all' | 'restaurant' | 'supplier' | 'admin'
  title: string
  body: string
  active_from: string
  active_until: string | null
  created_by: string
  created_at: string
}

export interface Inquiry {
  id: string
  organization_id: string
  user_id: string
  category: 'order' | 'settlement' | 'product' | 'system' | 'etc'
  status: 'open' | 'in_progress' | 'resolved'
  content: string
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  actor_user_id: string
  entity_type: string         // 예: 'order_item', 'settlement_period'
  entity_id: string
  action: 'create' | 'update' | 'delete'
  before_json: unknown | null
  after_json: unknown | null
  created_at: string
}

export interface IntegrationLog {
  id: string
  provider: 'kakao' | 'sms' | 'toss' | 'clova_ocr'
  event_type: string
  status: 'success' | 'failure'
  request_json: unknown
  response_json: unknown
  created_at: string
}
