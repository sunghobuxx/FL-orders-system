export const runtime = 'edge'

import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'

export default async function RootPage() {
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('memberships')
    .select('role, organizations(organization_type)')
    .eq('user_id', user.id)

  const isAdmin = memberships?.some(m => {
    const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations
    return (org as { organization_type: string } | null)?.organization_type === 'platform' ||
           (org as { organization_type: string } | null)?.organization_type === 'operator'
  })

  redirect(isAdmin ? '/admin/dashboard' : '/member/dashboard')
}
