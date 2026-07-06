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

  const CHANNEL_LABEL: Record<string, string> = { kakao: '카카오', sms: 'SMS', email: '이메일' }

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">공급처 관리</h1>
        <Link
          href="/admin/suppliers/new"
          className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700"
        >
          + 신규 공급처
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">등록된 공급처가 없습니다.</p>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
              <span>공급처명</span>
              <span className="text-center">발주 채널</span>
              <span className="text-center">상태</span>
              <span></span>
            </div>
            <div className="divide-y divide-gray-100">
              {[...active, ...inactive].map(row => (
                <div key={row.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-5 py-3">
                  <span className={`text-sm font-medium ${row.status === 'active' ? 'text-gray-900' : 'text-gray-400'}`}>
                    {row.organizations?.name ?? '알 수 없음'}
                  </span>
                  <span className="text-xs text-center text-gray-600 bg-gray-100 px-2.5 py-1 rounded">
                    {CHANNEL_LABEL[row.dispatch_channel ?? ''] ?? row.dispatch_channel ?? '-'}
                  </span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full text-center ${
                    row.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {row.status === 'active' ? '활성' : '비활성'}
                  </span>
                  <Link href={`/admin/suppliers/${row.id}`} className="text-xs text-brand-600 hover:underline">
                    편집
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <p className="text-xs text-gray-400">활성 {active.length}개 / 전체 {rows.length}개</p>
    </div>
  )
}
