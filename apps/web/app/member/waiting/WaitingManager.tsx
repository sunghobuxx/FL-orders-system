'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import QRCode from 'react-qr-code'

type Entry = {
  id: string
  name: string
  phone: string
  party_size: number
  status: string | null
  created_at: string
}

type Restaurant = { id: string; name: string; waitingEnabled: boolean }

function moveDate(date: string, delta: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

function timeLabel(iso: string) {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(11, 16)
}

const STATUS_LABEL: Record<string, string> = {
  waiting: '대기중', called: '호출됨', seated: '입장완료', entered: '입장완료',
  cancelled: '취소', no_show: '노쇼',
}

export default function WaitingManager({ date, today }: { date: string; today: string }) {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [customerUrl, setCustomerUrl] = useState('')
  const [isPending, startTransition] = useTransition()

  async function load() {
    setError('')
    const res = await fetch(`/api/member/waiting?date=${date}`, { cache: 'no-store' })
    const data = await res.json() as { error?: string; restaurant?: Restaurant; entries?: Entry[] }
    if (!res.ok || data.error) {
      setError(data.error ?? '웨이팅 내역을 불러오지 못했습니다.')
    } else {
      setRestaurant(data.restaurant ?? null)
      setEntries(data.entries ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [date])
  useEffect(() => {
    if (restaurant) setCustomerUrl(`${window.location.origin}/waiting/${restaurant.id}`)
  }, [restaurant])

  function update(entryId: string, status: string) {
    setError('')
    startTransition(async () => {
      const res = await fetch('/api/member/waiting', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, status }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok || data.error) setError(data.error ?? '상태 수정에 실패했습니다.')
      else await load()
    })
  }

  const waitingCount = entries.filter(entry => !entry.status || entry.status === 'waiting').length
  const calledCount = entries.filter(entry => entry.status === 'called').length

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">웨이팅 관리</h1>
          {restaurant && <p className="text-xs text-gray-400 mt-1">{restaurant.name}</p>}
        </div>
        {restaurant?.waitingEnabled && customerUrl && (
          <button type="button" onClick={() => setShowQr(value => !value)} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
            QR 보기
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-between px-4 py-3">
        <Link href={`/member/waiting?date=${moveDate(date, -1)}`} className="text-gray-400 text-lg">←</Link>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span>{date}</span>
          {date === today && <span className="text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded">오늘</span>}
        </div>
        {date < today
          ? <Link href={`/member/waiting?date=${moveDate(date, 1)}`} className="text-gray-400 text-lg">→</Link>
          : <span className="text-gray-200 text-lg">→</span>}
      </div>

      {showQr && customerUrl && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col items-center gap-3">
          <QRCode value={customerUrl} size={180} />
          <p className="text-xs text-gray-500 break-all text-center">{customerUrl}</p>
        </div>
      )}

      {restaurant?.waitingEnabled && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{waitingCount}</div>
            <div className="text-xs text-gray-500 mt-1">대기중</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-orange-500">{calledCount}</div>
            <div className="text-xs text-gray-500 mt-1">호출됨</div>
          </div>
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">불러오는 중...</div>
      ) : !restaurant?.waitingEnabled ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-400">
          웨이팅 기능이 활성화되지 않은 업장입니다.<br />관리자에게 문의해주세요.
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-400">현재 대기 없음</div>
      ) : (
        <div className="space-y-2">
          {entries.map(entry => {
            const status = entry.status ?? 'waiting'
            const done = ['seated', 'entered', 'cancelled', 'no_show'].includes(status)
            return (
              <div key={entry.id} className={`bg-white rounded-xl border border-gray-200 px-4 py-4 ${done ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{entry.name} <span className="font-normal text-gray-500">{entry.party_size}명</span></p>
                    <p className="text-xs text-gray-400 mt-1">{entry.phone} · 접수 {timeLabel(entry.created_at)}</p>
                  </div>
                  <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{STATUS_LABEL[status] ?? status}</span>
                </div>
                {!done && (
                  <div className="flex gap-2 mt-3">
                    {status === 'waiting' && (
                      <>
                        <button type="button" disabled={isPending} onClick={() => update(entry.id, 'called')} className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white disabled:opacity-50">자리남 알림</button>
                        <button type="button" disabled={isPending} onClick={() => update(entry.id, 'cancelled')} className="flex-1 rounded-lg bg-gray-100 py-2 text-sm font-semibold text-gray-600 disabled:opacity-50">취소</button>
                      </>
                    )}
                    {status === 'called' && (
                      <>
                        <button type="button" disabled={isPending} onClick={() => update(entry.id, 'seated')} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-50">입장</button>
                        <button type="button" disabled={isPending} onClick={() => update(entry.id, 'no_show')} className="flex-1 rounded-lg bg-gray-100 py-2 text-sm font-semibold text-gray-600 disabled:opacity-50">노쇼</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
