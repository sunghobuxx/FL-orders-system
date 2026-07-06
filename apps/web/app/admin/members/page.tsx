export const runtime = 'edge'

import Link from 'next/link'
import { getSessionUser } from '@/lib/supabase/server'
import AdminMembersShell from './AdminMembersShell'

export default async function AdminMembersPage() {
  const { supabase: db } = await getSessionUser()

  const { data: orgs } = await db
    .from('organizations')
    .select('id, name, organization_type, created_at, memberships(role, users(email))')
    .eq('organization_type', 'restaurant')
    .order('name')

  return (
    <AdminMembersShell>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">총 {(orgs ?? []).length}개 업체</span>
          <Link href="/admin/members/new"
            className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700">
            + 신규 등록
          </Link>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {(orgs ?? []).length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">등록된 업체가 없습니다.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {(orgs ?? []).map(org => {
                const membership = (org.memberships as unknown as { role: string; users: { email: string } | null }[] | null)?.[0]
                return (
                  <Link key={org.id} href={`/admin/members/${org.id}`}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{org.name}</div>
                      {membership?.users?.email && (
                        <div className="text-xs text-gray-400 mt-0.5">{membership.users.email}</div>
                      )}
                    </div>
                    <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AdminMembersShell>
  )
}
