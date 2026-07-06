export const runtime = 'edge'

import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'

import { ChangePasswordForm } from './ChangePasswordForm'
import ProfileFormClient from './ProfileFormClient'

export default async function MemberProfilePage() {
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships')
    .select('role, organizations(id, name)')
    .eq('user_id', user.id)
    .single()

  const orgData = membership?.organizations
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string; name: string } | undefined

  const { data: contact } = org
    ? await supabase
        .from('contacts').select('name, phone').eq('organization_id', org.id).eq('is_primary', true).maybeSingle()
    : { data: null }

  const { data: restaurant } = org
    ? await supabase.from('restaurants').select('id, biz_no').eq('organization_id', org.id).maybeSingle()
    : { data: null }

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      <div className="md:hidden flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200">
        <span className="px-4 py-1.5 rounded-lg text-sm font-medium border bg-gray-800 text-white border-gray-800">
          회원정보
        </span>
      </div>

      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:flex w-40 shrink-0 bg-white border-r border-gray-200 flex-col gap-2 p-3 pt-5">
          <div className="block text-center px-3 py-2.5 rounded-lg text-sm font-medium border bg-gray-800 text-white border-gray-800">
            회원정보
          </div>
        </aside>

        <div className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
          <div className="max-w-2xl space-y-4">
            <ProfileFormClient
              orgId={org?.id ?? ''}
              restaurantId={restaurant?.id ?? null}
              orgName={org?.name ?? ''}
              contactName={contact?.name ?? ''}
              phone={contact?.phone ?? ''}
              bizNo={restaurant?.biz_no ?? ''}
              email={user.email ?? ''}
            />
            <ChangePasswordForm />
          </div>
        </div>
      </div>
    </div>
  )
}
