import { redirect } from 'next/navigation'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

type MembershipWithOrganization = {
  role: string
  organizations: { organization_type: string } | { organization_type: string }[] | null
}

function hasAdminAccess(memberships: MembershipWithOrganization[] | null) {
  return memberships?.some((membership) => {
    const organization = Array.isArray(membership.organizations)
      ? membership.organizations[0]
      : membership.organizations

    return ['admin', 'manager'].includes(membership.role) ||
      organization?.organization_type === 'platform' ||
      organization?.organization_type === 'operator'
  }) ?? false
}

export async function getAuthorizedAdminDb() {
  const { user } = await getSessionUser()
  if (!user) return null

  const db = createAdminClient()
  const { data: memberships } = await db
    .from('memberships')
    .select('role, organizations(organization_type)')
    .eq('user_id', user.id)

  return hasAdminAccess(memberships as MembershipWithOrganization[] | null) ? db : null
}

/**
 * 어드민 API 용 — 로그인한 사람이 관리자인지까지 보고, 사용자와 service role db 를 함께 준다.
 *
 * 예전에는 라우트마다 `getSessionUser()` 로 로그인만 봤다. 그러면 **회원 계정으로도
 * 통과한다** — 발주 수정·명세서 단가 수정·문자 발송 같은 쓰기 API 가 30개 그 상태였다
 * (2026-08-15 확인).
 *
 * 권한이 없으면 null 을 준다. 부르는 쪽에서 403 으로 돌려보낸다.
 */
export async function getAdminSession() {
  const { user } = await getSessionUser()
  if (!user) return null

  const db = createAdminClient()
  const { data: memberships } = await db
    .from('memberships')
    .select('role, organizations(organization_type)')
    .eq('user_id', user.id)

  if (!hasAdminAccess(memberships as MembershipWithOrganization[] | null)) return null
  return { user, db }
}

export async function requireAuthorizedAdminDb() {
  const db = await getAuthorizedAdminDb()
  if (!db) redirect('/login')
  return db
}

export async function getOrganizationLoginUser(
  db: ReturnType<typeof createAdminClient>,
  organizationId: string,
) {
  const { data: memberships } = await db
    .from('memberships')
    .select('user_id, role')
    .eq('organization_id', organizationId)

  const candidates = [...(memberships ?? [])].sort((a, b) => {
    if (a.role === 'owner' && b.role !== 'owner') return -1
    if (a.role !== 'owner' && b.role === 'owner') return 1
    return 0
  })

  for (const membership of candidates) {
    const { data, error } = await db.auth.admin.getUserById(membership.user_id)
    if (!error && data.user?.email) {
      return { id: data.user.id, email: data.user.email }
    }
  }

  return null
}
