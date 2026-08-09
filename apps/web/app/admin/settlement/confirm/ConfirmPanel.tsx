'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

import type { ConfirmRow, PeriodOption } from './page'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/** "2026-08-02" ~ "2026-08-08" → "08.02 ~ 08.08" */
function periodLabel(start: string, end: string) {
  const [, sm, sd] = start.split('-')
  const [, em, ed] = end.split('-')
  return `${sm}.${sd} ~ ${em}.${ed}`
}

interface Props {
  rows: ConfirmRow[]
  cycle: string
  periods: PeriodOption[]
  selectedPeriodId: string | null
}

export default function ConfirmPanel({ rows, cycle, periods, selectedPeriodId }: Props) {
  const router = useRouter()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const pending = rows.filter(r => !r.confirmedAt)
  const allPicked = pending.length > 0 && pending.every(r => picked.has(r.statementId))

  function toggle(id: string) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setPicked(allPicked ? new Set() : new Set(pending.map(r => r.statementId)))
  }

  // 이름을 confirm 으로 지으면 전역 window.confirm 을 가려 버린다.
  async function runConfirm(ids: string[], resend = false) {
    if (!ids.length) return
    const label = resend ? '재발송' : '확정·발송'
    if (!askUser(`${ids.length}건을 ${label}합니다.\n확정하면 금액을 되돌릴 수 없습니다. 계속할까요?`)) return
    setBusy(true); setMsg('')
    try {
      const res = await fetch('/api/admin/settlement/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statementIds: ids, resend }),
      })
      const data = await res.json() as { error?: string; results?: Array<{ success: boolean }> }
      if (!res.ok) throw new Error(data.error ?? `${label} 실패`)
      const ok = (data.results ?? []).filter(r => r.success).length
      setMsg(`${label} 완료 — ${ids.length}건 중 발송 성공 ${ok}건`)
      setPicked(new Set())
      router.refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : `${label} 실패`)
    } finally {
      setBusy(false)
    }
  }

  // window.confirm 을 감싸 SSR 에서 터지지 않게 한다
  function askUser(text: string) {
    return typeof window === 'undefined' ? true : window.confirm(text)
  }

  const tabClass = (active: boolean) =>
    `px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
      active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`

  return (
    <div className="space-y-3 max-w-4xl">
      {/* 주기 → 기간 순서로 좁힌다. 마감된 것을 전부 늘어놓으면 이번에 넘길 것을 못 찾는다. */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
        <div className="flex gap-2">
          <Link href="/admin/settlement/confirm?cycle=weekly" className={tabClass(cycle === 'weekly')}>
            주정산
          </Link>
          <Link href="/admin/settlement/confirm?cycle=monthly" className={tabClass(cycle === 'monthly')}>
            월정산
          </Link>
        </div>
        {periods.length === 0 ? (
          <p className="text-sm text-gray-400">마감된 기간이 없습니다</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {periods.map(p => (
              <Link
                key={p.id}
                href={`/admin/settlement/confirm?cycle=${cycle}&period=${p.id}`}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  p.id === selectedPeriodId
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {periodLabel(p.start, p.end)}
                {p.pending > 0 && (
                  <span className={p.id === selectedPeriodId ? ' opacity-80' : ' text-amber-600'}>
                    {' '}미확정 {p.pending}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {cycle === 'weekly' ? '주정산' : '월정산'} {rows.length}곳 · 미확정 {pending.length}곳
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-sm text-gray-600">{msg}</span>}
          <button
            type="button"
            onClick={toggleAll}
            className="rounded-lg border border-gray-300 text-gray-700 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
          >
            {allPicked ? '선택 해제' : '전체 선택'}
          </button>
          <button
            type="button"
            onClick={() => runConfirm([...picked])}
            disabled={busy || picked.size === 0}
            className="rounded-lg bg-brand-600 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? '처리 중...' : `선택한 ${picked.size}곳 확정·발송`}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-[32px_1fr_110px_110px_110px_150px] gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
          <span></span><span>업체 · 기간</span>
          <span className="text-right">당기</span><span className="text-right">이전</span>
          <span className="text-right">합계</span><span>상태</span>
        </div>
        <div className="divide-y divide-gray-100">
          {rows.length === 0 && (
            <p className="py-12 text-center text-sm text-gray-400">이 기간에 정산서가 없습니다</p>
          )}
          {rows.map(r => (
            <div key={r.statementId} className="grid grid-cols-[32px_1fr_110px_110px_110px_150px] gap-2 items-center px-4 py-3">
              <input
                type="checkbox"
                checked={picked.has(r.statementId)}
                onChange={() => toggle(r.statementId)}
                disabled={Boolean(r.confirmedAt)}
                className="w-4 h-4"
              />
              <div className="min-w-0">
                <div className="text-sm text-gray-900 truncate">{r.orgName}</div>
                <div className="text-xs text-gray-400">{r.start} ~ {r.end}</div>
              </div>
              <span className="text-sm text-gray-700 text-right tabular-nums">{won(r.current)}</span>
              <span className={`text-sm text-right tabular-nums ${r.carryover > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                {won(r.carryover)}
              </span>
              <span className="text-sm font-semibold text-gray-900 text-right tabular-nums">{won(r.total)}</span>
              <div className="text-xs">
                {r.confirmedAt ? (
                  r.notifiedAt
                    ? <span className="text-green-600 font-medium">확정 · 발송완료</span>
                    : (
                      <span className="text-red-500 font-medium">
                        확정 · {r.reason || '발송 실패'}
                        {r.sendable && (
                          <button
                            type="button"
                            onClick={() => runConfirm([r.statementId], true)}
                            disabled={busy}
                            className="ml-2 underline hover:text-red-700"
                          >
                            재발송
                          </button>
                        )}
                      </span>
                    )
                ) : (
                  <span className={r.sendable ? 'text-gray-500' : 'text-amber-600'}>
                    {r.reason || (r.phone ?? '')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
