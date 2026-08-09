'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import type { RequestRow } from './page'

export default function RequestPanel({ rows }: { rows: RequestRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  async function decide(id: string, action: 'approve' | 'reject') {
    if (action === 'reject' && !window.confirm('이 요청을 거절할까요?')) return
    setBusy(id)
    setMsg('')
    try {
      const res = await fetch('/api/admin/products/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id, action }),
      })
      const d = await res.json() as { error?: string }
      if (!res.ok) throw new Error(d.error ?? '처리하지 못했습니다')
      router.refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '처리하지 못했습니다')
    } finally {
      setBusy(null)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-400">
        대기 중인 품목 요청이 없습니다
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {msg && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{msg}</p>
      )}

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {rows.map(r => (
          <div key={r.id} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-gray-900">{r.orgName}</div>
              <div className="text-xs text-gray-400">{r.productName} · 요청 {r.requestedAt}</div>
            </div>
            <button
              type="button"
              onClick={() => decide(r.id, 'approve')}
              disabled={busy === r.id}
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
            >
              승인
            </button>
            <button
              type="button"
              onClick={() => decide(r.id, 'reject')}
              disabled={busy === r.id}
              className="rounded-lg border border-gray-300 px-4 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              거절
            </button>
          </div>
        ))}
      </div>

      <p className="px-1 text-xs text-gray-400">
        단가가 없는 품목은 승인되지 않습니다. 품목 마스터에서 단가를 먼저 등록해 주세요.
      </p>
    </div>
  )
}
