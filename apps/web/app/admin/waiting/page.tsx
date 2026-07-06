export const runtime = 'edge'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function AdminWaitingPage() {
  const db = createAdminClient()

  const { data: restaurants } = await db
    .from('restaurants')
    .select('id, organizations(name), waiting_enabled')
    .order('created_at')

  type Row = { id: string; waiting_enabled: boolean | null; organizations: { name: string } | null }
  const rows = (restaurants ?? []) as unknown as Row[]
  const enabled = rows.filter(r => r.waiting_enabled)
  const disabled = rows.filter(r => !r.waiting_enabled)

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">웨이팅 현황</h1>
        <span className="text-sm text-gray-500">활성 {enabled.length}개 / 전체 {rows.length}개 업체</span>
      </div>

      {/* 웨이팅 활성 업체 */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">웨이팅 활성화</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {enabled.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">웨이팅 활성화된 업체가 없습니다.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {enabled.map(r => (
                <div key={r.id} className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm font-medium text-gray-900">{r.organizations?.name ?? '알 수 없음'}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-semibold">활성</span>
                    <Link
                      href={`/admin/members/${r.id}`}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      설정 →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 웨이팅 비활성 업체 */}
      {disabled.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">웨이팅 비활성화</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {disabled.map(r => (
                <div key={r.id} className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-gray-500">{r.organizations?.name ?? '알 수 없음'}</span>
                  <Link
                    href={`/admin/members/${r.id}`}
                    className="text-xs text-gray-400 hover:text-gray-600 hover:underline"
                  >
                    설정 →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">웨이팅 활성화/비활성화는 회원정보 → 업체 상세에서 설정합니다.</p>
    </div>
  )
}
