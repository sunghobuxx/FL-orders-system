// 조직 / 권한 타입

export type OrganizationType = 'platform' | 'operator' | 'restaurant' | 'supplier'

export type MemberRole = 'owner' | 'manager' | 'staff'

export interface Organization {
  id: string
  organization_type: OrganizationType
  name: string
  status: 'active' | 'inactive' | 'suspended'
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  email: string | null
  phone: string | null
  name: string
  status: 'active' | 'inactive'
  created_at: string
}

export interface Membership {
  id: string
  user_id: string
  organization_id: string
  role: MemberRole
  created_at: string
}
