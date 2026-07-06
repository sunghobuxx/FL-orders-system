export const runtime = 'edge'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import NoticesShell from './NoticesShell'

export default async function MemberNoticesPage() {
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: notices } = await supabase
    .from('notices')
    .select('id, title, created_at')
    .order('created_at', { ascending: false })

  return (
    <NoticesShell>
      <div className="space-y-2">
        {(notices ?? []).length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 text-sm text-gray-400 text-center">
            공지사항이 없습니다.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {(notices ?? []).map(n => (
                <Link key={n.id} href={`/member/notices/${n.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <span className="text-sm text-gray-900 flex-1 truncate">{n.title}</span>
                  <span className="text-xs text-gray-400 ml-3 shrink-0">
                    {new Date(n.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' })}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </NoticesShell>
  )
}
