export const runtime = 'edge'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function AdminSuppliersPage() {
  const db = createAdminClient()

  const { data: suppliers } = await db
    .from('suppliers')
    .select('id, status, dispatch_channel, organizations(name, id)')
    .order('created_at')

  type Row = { id: string; status: string; dispatch_channel: string | null; organizations: { name: string; id: string } | null }
  const rows = (suppliers ?? []) as unknown as Row[]
  const active = rows.filter(r => r.status === 'active')
  const inactive = rows.filter(r => r.status !== 'active')
  const sorted = [...active, ...inactive]

  const CHANNEL_LABEL: Record<string, string> = { kakao: '카카오톡', sms: 'SMS', email: '이메일' }

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">공급처 관리</h1>
          <p className="text-sm text-gray-400 mt-0.5">발주 품목을 담당하는 공급처 목록</p>
        </div>
        <Link
          href="/admin/suppliers/new"
          className="rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-semibold hover:bg-gray-700 transition-colors"
        >
          + 공급처 등록
        </Link>
      </div>

      {sorted.length === 0 ? (
        <p className="py-10 text-sm text-gray-400 text-center">등록된 공급처가 없습니다.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {sorted.map(row => (
            <div key={row.id} className="flex items-center justify-between px-5 py-4 gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="text-sm font-semibold text-gray-900 truncate">
                  {row.organizations?.name ?? '알 수 없음'}
                </span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {CHANNEL_LABEL[row.dispatch_channel ?? ''] ?? row.dispatch_channel ?? '미설정'}
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  row.status === 'active'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-400'
                }`}>
                  {row.status === 'active' ? '활성' : '비활성'}
                </span>
              </div>
              <Link
                href={`/admin/suppliers/${row.id}`}
                className="shrink-0 text-xs font-semibold text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                편집
              </Link>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-400">활성 {active.length}개 / 전체 {rows.length}개</p>
    </div>
  )
}
