'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function SendSmsButton({ specId, notifiedAt }: { specId: string; notifiedAt: string | null }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleSend() {
    const confirmText = notifiedAt
      ? '이미 한 번 보낸 명세서입니다. 다시 보내시겠습니까?'
      : '회원정보에 등록된 휴대폰번호로 이 명세서를 문자로 보내시겠습니까?'
    if (!confirm(confirmText)) return
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch('/api/admin/specs/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '발송 실패')
      setMsg('✅ 발송 완료')
      router.refresh()
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : '발송 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleSend}
        disabled={loading}
        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {loading ? '발송 중...' : notifiedAt ? '문자 재발송' : '문자로 보내기'}
      </button>
      {msg && (
        <span className={`text-xs ${msg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>
          {msg}
        </span>
      )}
    </span>
  )
}
