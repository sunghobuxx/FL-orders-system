export const runtime = 'edge'

import Link from 'next/link'
import { requireAdminNoticesDb } from '@/lib/admin-notices'
import AdminNoticesShell from './AdminNoticesShell'

export default async function AdminNoticesPage() {
  const db = await requireAdminNoticesDb()

  const { data: notices } = await db
    .from('notices')
    .select('id, title, created_at')
    .order('created_at', { ascending: false })

  const rows = notices ?? []

  return (
    <AdminNoticesShell>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">총 {rows.length}개</span>
          <Link
            href="/admin/notices/new"
            className="rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-semibold hover:bg-gray-700 transition-colors"
          >
            + 새 공지
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-sm text-gray-400 text-center">등록된 공지가 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 w-14">No.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">제목</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 w-24">날짜</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((n, i) => (
                  <tr key={n.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-center text-xs text-gray-400 font-medium tabular-nums">
                      {rows.length - i}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/notices/${n.id}`} className="text-gray-900 hover:text-brand-600 transition-colors">
                        {n.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-400 tabular-nums">
                      {new Date(n.created_at).toLocaleDateString('ko-KR', {
                        timeZone: 'Asia/Seoul',
                        year: '2-digit',
                        month: '2-digit',
                        day: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminNoticesShell>
  )
}
