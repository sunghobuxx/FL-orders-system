import { redirect } from 'next/navigation'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

export async function requireAdminNoticesDb() {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')

  const adminDb = createAdminClient()
  const { data: membership } = await adminDb
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['admin', 'manager'])
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/member/dashboard')
  return adminDb
}
