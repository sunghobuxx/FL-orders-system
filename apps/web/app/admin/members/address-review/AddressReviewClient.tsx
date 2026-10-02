'use client'

import { useState } from 'react'

interface Row {
  id: string
  name: string
  typeLabel: string
  address: string | null
}

interface RowState {
  value: string
  candidates: string[]
  searching: boolean
  saving: boolean
  saved: boolean
  error: string | null
  /** 검색으로 채워졌고 아직 저장 전 — 꼭 확인하라고 눈에 띄게 표시한다 */
  suggested: boolean
}

function initState(rows: Row[]): Record<string, RowState> {
  const s: Record<string, RowState> = {}
  for (const r of rows) {
    s[r.id] = { value: r.address ?? '', candidates: [], searching: false, saving: false, saved: false, error: null, suggested: false }
  }
  return s
}

export default function AddressReviewClient({ rows }: { rows: Row[] }) {
  const [state, setState] = useState<Record<string, RowState>>(() => initState(rows))
  const [bulkRunning, setBulkRunning] = useState(false)

  function patch(id: string, p: Partial<RowState>) {
    setState(prev => ({ ...prev, [id]: { ...prev[id], ...p } }))
  }

  async function searchOne(row: Row) {
    patch(row.id, { searching: true, error: null })
    try {
      const res = await fetch(`/api/admin/members/address-search?q=${encodeURIComponent(row.name)}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? '검색 실패')
      const candidates = (d.candidates as { address: string }[]).map(c => c.address)
      if (candidates.length === 0) {
        patch(row.id, { searching: false, error: '검색 결과 없음' })
        return
      }
      patch(row.id, { searching: false, candidates, value: candidates[0], suggested: true, saved: false })
    } catch (err: unknown) {
      patch(row.id, { searching: false, error: err instanceof Error ? err.message : '검색 실패' })
    }
  }

  async function saveOne(row: Row) {
    patch(row.id, { saving: true, error: null })
    try {
      const res = await fetch(`/api/admin/members/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: state[row.id].value }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? '저장 실패')
      }
      patch(row.id, { saving: false, saved: true, suggested: false })
    } catch (err: unknown) {
      patch(row.id, { saving: false, error: err instanceof Error ? err.message : '저장 실패' })
    }
  }

  async function searchAllMissing() {
    setBulkRunning(true)
    // 카카오 API 를 한 번에 몰아치지 않게 순서대로 돈다.
    for (const row of rows) {
      if (state[row.id].value.trim()) continue
      await searchOne(row)
      await new Promise(r => setTimeout(r, 150))
    }
    setBulkRunning(false)
  }

  const missingCount = rows.filter(r => !state[r.id]?.value?.trim()).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">주소 없는 업체 {missingCount}곳</span>
        <button
          type="button"
          onClick={searchAllMissing}
          disabled={bulkRunning || missingCount === 0}
          className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
        >
          {bulkRunning ? '검색 중...' : '주소 없는 업체 전체 검색'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {rows.map(row => {
          const s = state[row.id]
          return (
            <div key={row.id} className="px-4 py-3 flex items-center gap-3">
              <div className="w-32 shrink-0">
                <div className="text-sm font-medium text-gray-800 truncate">{row.name}</div>
                <div className="text-xs text-gray-400">{row.typeLabel}</div>
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <input
                  value={s.value}
                  onChange={e => patch(row.id, { value: e.target.value, saved: false })}
                  placeholder="주소 없음"
                  className={`w-full rounded px-3 py-1.5 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                    s.suggested ? 'bg-amber-50 ring-1 ring-amber-300' : 'bg-gray-100'
                  }`}
                />
                {s.candidates.length > 1 && (
                  <div className="flex flex-wrap gap-1">
                    {s.candidates.map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => patch(row.id, { value: c, saved: false })}
                        className={`text-xs px-2 py-0.5 rounded border ${
                          c === s.value ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        후보 {i + 1}
                      </button>
                    ))}
                  </div>
                )}
                {s.error && <p className="text-xs text-red-500">{s.error}</p>}
                {s.suggested && !s.error && <p className="text-xs text-amber-600">검색 결과 — 확인 후 저장하세요</p>}
              </div>

              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => searchOne(row)}
                  disabled={s.searching}
                  className="rounded-lg border border-gray-300 text-gray-600 px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
                >
                  {s.searching ? '검색 중' : '검색'}
                </button>
                <button
                  type="button"
                  onClick={() => saveOne(row)}
                  disabled={s.saving || !s.value.trim()}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                    s.saved ? 'bg-green-100 text-green-700' : 'bg-brand-600 text-white hover:bg-brand-700'
                  }`}
                >
                  {s.saving ? '저장 중' : s.saved ? '저장됨 ✓' : '저장'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
