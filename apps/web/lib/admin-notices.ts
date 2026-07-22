import { redirect } from 'next/navigation'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

type NoticeMembership = {
  role: string
  organizations: { organization_type: string } | { organization_type: string }[] | null
}

export function hasNoticeAdminAccess(memberships: NoticeMembership[] | null) {
  return memberships?.some((membership) => {
    const organization = Array.isArray(membership.organizations)
      ? membership.organizations[0]
      : membership.organizations

    return ['admin', 'manager'].includes(membership.role) ||
      organization?.organization_type === 'platform' ||
      organization?.organization_type === 'operator'
  }) ?? false
}

export async function requireAdminNoticesDb() {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')

  const adminDb = createAdminClient()
  const { data: memberships } = await adminDb
    .from('memberships')
    .select('role, organizations(organization_type)')
    .eq('user_id', user.id)

  if (!hasNoticeAdminAccess(memberships as NoticeMembership[] | null)) {
    redirect('/member/dashboard')
  }
  return adminDb
}
