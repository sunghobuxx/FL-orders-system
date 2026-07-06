export const runtime = 'edge'

import Link from 'next/link'
import { getSessionUser } from '@/lib/supabase/server'
import AdminNoticesShell from './AdminNoticesShell'

export default async function AdminNoticesPage() {
  const { supabase: db } = await getSessionUser()

  const { data: notices } = await db
    .from('notices')
    .select('id, title, created_at')
    .order('created_at', { ascending: false })

  return (
    <AdminNoticesShell>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">총 {(notices ?? []).length}개</span>
          <Link href="/admin/notices/new"
            className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700">
            + 새 공지
          </Link>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {(notices ?? []).length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">등록된 공지가 없습니다.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {(notices ?? []).map(n => (
                <Link key={n.id} href={`/admin/notices/${n.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <span className="text-sm text-gray-900 flex-1 truncate">{n.title}</span>
                  <span className="text-xs text-gray-400 ml-3 shrink-0">
                    {new Date(n.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminNoticesShell>
  )
}
