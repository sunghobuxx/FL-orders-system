export const runtime = 'edge'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'

const WAITING_URL = 'https://atzmpmnuibsrkkvpwsfy.supabase.co'
const WAITING_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0em1wbW51aWJzcmtrdnB3c2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTgxMzYsImV4cCI6MjA5NzYzNDEzNn0.OtlpMz5GMONGPVbGFcpzqDZQtMGsl8niWdeZI5sAB5w'

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  waiting:  { label: '대기중',  cls: 'bg-blue-100 text-blue-700' },
  '대기중': { label: '대기중',  cls: 'bg-blue-100 text-blue-700' },
  called:   { label: '호출됨',  cls: 'bg-orange-100 text-orange-600' },
  '호출됨': { label: '호출됨',  cls: 'bg-orange-100 text-orange-600' },
  entered:  { label: '입장완료', cls: 'bg-gray-100 text-gray-500' },
  '입장완료':{ label: '입장완료', cls: 'bg-gray-100 text-gray-500' },
}

function kstTime(iso: string | null): string | null {
  if (!iso) return null
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(11, 16)
}

interface Props {
  params: Promise<{ restaurantId: string }>
  searchParams: Promise<{ date?: string }>
}

export default async function AdminWaitingDetailPage({ params, searchParams }: Props) {
  const { restaurantId } = await params
  const { date: dateParam } = await searchParams
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
  const date = dateParam ?? today

  const prevDate = (() => { const d = new Date(date); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] })()
  const nextDate = (() => { const d = new Date(date); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] })()

  const db = createAdminClient()
  const { data: rest } = await db
    .from('restaurants')
    .select('id, organizations(name)')
    .eq('id', restaurantId)
    .single()
  type R = { id: string; organizations: { name: string } | null }
  const orgName = ((rest as unknown as R | null)?.organizations?.name) ?? '알 수 없음'

  const waitingDb = createClient(WAITING_URL, WAITING_ANON)
  const dateStart = new Date(`${date}T00:00:00+09:00`).toISOString()
  const dateEnd = new Date(`${date}T23:59:59.999+09:00`).toISOString()

  type Entry = {
    id: string
    name: string
    phone: string
    party_size: number
    status: string | null
    created_at: string
    called_at: string | null
    entered_at: string | null
  }

  const { data: rawEntries } = await waitingDb
    .from('waiting_entries')
    .select('id, name, phone, party_size, status, created_at, called_at, entered_at')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', dateStart)
    .lte('created_at', dateEnd)
    .order('created_at')

  const entries = (rawEntries ?? []) as Entry[]

  const waitingCount = entries.filter(e => e.status === 'waiting' || e.status === '대기중' || !e.status).length
  const calledCount  = entries.filter(e => e.status === 'called'  || e.status === '호출됨').length
  const enteredCount = entries.filter(e => e.status === 'entered' || e.status === '입장완료').length

  return (
    <div className="p-6 max-w-3xl space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/admin/waiting" className="text-sm text-gray-400 hover:text-gray-600">← 전체 업체</Link>
        <h1 className="text-lg font-bold text-gray-900">{orgName}</h1>
      </div>

      {/* 날짜 네비게이션 */}
      <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-between px-4 py-3">
        <Link href={`/admin/waiting/${restaurantId}?date=${prevDate}`} className="p-1 rounded hover:bg-gray-100 text-gray-400 text-lg leading-none">←</Link>
        <span className="text-sm font-semibold text-gray-700">{date}</span>
        <Link href={`/admin/waiting/${restaurantId}?date=${nextDate}`} className="p-1 rounded hover:bg-gray-100 text-gray-400 text-lg leading-none">→</Link>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{waitingCount}</div>
          <div className="text-xs text-gray-500 mt-1">대기중</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-orange-500">{calledCount}</div>
          <div className="text-xs text-gray-500 mt-1">호출됨</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{enteredCount}</div>
          <div className="text-xs text-gray-500 mt-1">입장완료</div>
        </div>
      </div>

      {/* 대기 목록 */}
      {entries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-sm text-gray-400">
          {date} 웨이팅 신청이 없습니다
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(entry => {
            const status = entry.status ?? 'waiting'
            const statusInfo = STATUS_MAP[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' }
            const times = [
              `접수 ${kstTime(entry.created_at)}`,
              entry.called_at  ? `호출 ${kstTime(entry.called_at)}`  : null,
              entry.entered_at ? `입장 ${kstTime(entry.entered_at)}` : null,
            ].filter(Boolean).join(' · ')
            return (
              <div key={entry.id} className="bg-white rounded-xl border border-gray-200 flex items-center justify-between px-5 py-4">
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {entry.name} <span className="font-normal text-gray-500">{entry.party_size}명</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{entry.phone} · {times}</div>
                </div>
                <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${statusInfo.cls}`}>
                  {statusInfo.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
