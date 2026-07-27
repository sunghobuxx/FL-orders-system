export const runtime = 'edge'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminMembersShell from './AdminMembersShell'

const TYPE_LABELS: Record<string, string> = {
  restaurant: '매출 업체',
  supplier: '매입 공급처',
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; inactive?: string }>
}) {
  const { view = 'restaurant', inactive } = await searchParams
  const orgType = view === 'supplier' ? 'supplier' : 'restaurant'
  const showInactive = inactive === '1'
  const supabase = createAdminClient()

  // 기본은 활성만, 토글하면 비활성만 따로 모아 보여준다.
  // 목록이 길어져 작업이 불편해지지 않도록 둘을 섞지 않는다.
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, organization_type, status, updated_at')
    .eq('organization_type', orgType)
    .eq('status', showInactive ? 'inactive' : 'active')
    .order('name')

  return (
    <AdminMembersShell>
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center justify-between">
          <div className="flex gap-1 text-sm">
            <Link
              href="/admin/members?view=restaurant"
              className={`px-4 py-2 rounded-lg border font-medium transition-colors ${
                view !== 'supplier'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              매출 업체
            </Link>
            <Link
              href="/admin/members?view=supplier"
              className={`px-4 py-2 rounded-lg border font-medium transition-colors ${
                view === 'supplier'
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              매입 공급처
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/members?view=${orgType}${showInactive ? '' : '&inactive=1'}`}
              className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                showInactive
                  ? 'bg-gray-700 text-white border-gray-700'
                  : 'text-gray-500 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {showInactive ? '← 활성 목록' : '비활성 목록'}
            </Link>
            <Link
              href={`/admin/members/new?type=${orgType}`}
              className="rounded-lg bg-brand-600 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-700"
            >
              등록
            </Link>
          </div>
        </div>

        {(orgs ?? []).length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-sm text-gray-400">
            등록된 {view === 'supplier' ? '매입처' : '업체'}가 없습니다
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
              <span>업체명:</span>
              <span className="w-20 text-center">분류:</span>
              <span className="text-right">수정일:</span>
            </div>
            <div className="divide-y divide-gray-100">
              {(orgs ?? []).map((org: { id: string; name: string; organization_type: string; updated_at: string }) => (
                <Link
                  key={org.id}
                  href={`/admin/members/${org.id}`}
                  className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm text-gray-800 bg-gray-100 px-3 py-1.5 rounded">
                    {org.name}
                  </span>
                  <span className={`w-20 text-center text-xs font-semibold px-3 py-1.5 rounded ${
                    org.organization_type === 'restaurant'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}>
                    {TYPE_LABELS[org.organization_type] ?? org.organization_type}
                  </span>
                  <span className="text-sm text-right text-gray-500 bg-gray-100 px-3 py-1.5 rounded">
                    {new Date(org.updated_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminMembersShell>
  )
}
