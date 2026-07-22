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
