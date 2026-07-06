export const runtime = 'edge'

import Link from 'next/link'

import { getSessionUser } from '@/lib/supabase/server'

import AccountActions from './AccountActions'

export default async function AdminAccountsPage() {
  const { supabase: db, user: currentUser } = await getSessionUser()

  // users 테이블 + memberships + organizations 조인 (auth.admin 불필요)
  const { data: adminUsers } = await db
    .from('users')
    .select('id, email, name, status, created_at, memberships(role, organizations(id, name, organization_type))')
    .order('created_at', { ascending: true })

  // 플랫폼/운영자 조직 소속 유저만 필터링
  type AdminUser = NonNullable<typeof adminUsers>[number]
  const filtered = (adminUsers ?? []).filter((u: AdminUser) => {
    const mList = u.memberships as unknown as Array<{ role: string; organizations: { id: string; name: string; organization_type: string } | null }>
    return mList?.some(m => m.organizations?.organization_type === 'platform' || m.organizations?.organization_type === 'operator')
  })

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">관리자 계정</h1>
        <Link href="/admin/accounts/new"
          className="rounded-lg bg-gray-800 text-white px-4 py-2 text-sm font-medium hover:bg-gray-700">
          + 계정 추가
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">등록된 관리자 계정이 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">이름</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">이메일</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">역할</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">상태</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">가입일</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((u: AdminUser) => {
                const mList = u.memberships as unknown as Array<{ role: string; organizations: { id: string; name: string; organization_type: string } | null }>
                const m = mList?.[0]
                const org = m?.organizations
                const isCurrentUser = u.id === currentUser?.id
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800">
                      {u.name || org?.name || '-'}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{u.email}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        m?.role === 'owner' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {m?.role === 'owner' ? '오너' : m?.role === 'manager' ? '매니저' : m?.role ?? '-'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {u.status === 'active' ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-'}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {!isCurrentUser && (
                        <AccountActions
                          userId={u.id}
                          currentRole={m?.role ?? 'manager'}
                          membershipId={(u.memberships as unknown as Array<{id?: string}>)?.[0]?.id}
                        />
                      )}
                      {isCurrentUser && (
                        <span className="text-xs text-gray-400">본인</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
