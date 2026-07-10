export const runtime = 'edge'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'

const WAITING_URL = 'https://atzmpmnuibsrkkvpwsfy.supabase.co'
const WAITING_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0em1wbW51aWJzcmtrdnB3c2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTgxMzYsImV4cCI6MjA5NzYzNDEzNn0.OtlpMz5GMONGPVbGFcpzqDZQtMGsl8niWdeZI5sAB5w'

interface Props {
  searchParams: Promise<{ date?: string }>
}

export default async function AdminWaitingPage({ searchParams }: Props) {
  const { date: dateParam } = await searchParams
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
  const date = dateParam ?? today

  const prevDate = (() => { const d = new Date(date); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] })()
  const nextDate = (() => { const d = new Date(date); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] })()

  const db = createAdminClient()
  const { data: restaurants } = await db
    .from('restaurants')
    .select('id, organizations(name), waiting_enabled')
    .eq('waiting_enabled', true)
    .order('created_at')

  type RestRow = { id: string; waiting_enabled: boolean | null; organizations: { name: string } | null }
  const restRows = (restaurants ?? []) as unknown as RestRow[]

  const waitingDb = createClient(WAITING_URL, WAITING_ANON)
  const dateStart = new Date(`${date}T00:00:00+09:00`).toISOString()
  const dateEnd = new Date(`${date}T23:59:59.999+09:00`).toISOString()

  const { data: entries } = await waitingDb
    .from('waiting_entries')
    .select('restaurant_id')
    .gte('created_at', dateStart)
    .lte('created_at', dateEnd)

  const countMap = new Map<string, number>()
  for (const e of (entries ?? []) as { restaurant_id: string }[]) {
    countMap.set(e.restaurant_id, (countMap.get(e.restaurant_id) ?? 0) + 1)
  }

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <h1 className="text-lg font-bold text-gray-900">웨이팅 현황</h1>

      {/* 날짜 네비게이션 */}
      <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-between px-4 py-3">
        <Link href={`/admin/waiting?date=${prevDate}`} className="p-1 rounded hover:bg-gray-100 text-gray-400 text-lg leading-none">←</Link>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">{date}</span>
          {date === today
            ? <span className="text-xs text-brand-600 font-medium">오늘</span>
            : <Link href="/admin/waiting" className="text-xs text-brand-600 font-medium">오늘</Link>
          }
        </div>
        <Link href={`/admin/waiting?date=${nextDate}`} className="p-1 rounded hover:bg-gray-100 text-gray-400 text-lg leading-none">→</Link>
      </div>

      {/* 업체 목록 */}
      <div className="space-y-2">
        {restRows.map(r => {
          const count = countMap.get(r.id) ?? 0
          return (
            <Link
              key={r.id}
              href={`/admin/waiting/${r.id}${date !== today ? `?date=${date}` : ''}`}
              className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-900">{r.organizations?.name ?? '알 수 없음'}</span>
              <div className="flex items-center gap-1">
                <span className={`text-sm ${count > 0 ? 'text-brand-600 font-semibold' : 'text-gray-400'}`}>
                  {count > 0 ? `${count}명` : '없음'}
                </span>
                <span className="text-gray-300 text-sm">›</span>
              </div>
            </Link>
          )
        })}
        {restRows.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-sm text-gray-400">
            등록된 업체가 없습니다
          </div>
        )}
      </div>
    </div>
  )
}
