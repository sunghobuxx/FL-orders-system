'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 이미 발송된 공급처에 정정 문자를 다시 보낸다.
 *
 * confirm-dispatch 는 발송 이력이 있으면 "이미 발송됨"으로 끝내기 때문에,
 * 02:30 자동발송 뒤 수량을 고쳐도 공급처에게 전달할 방법이 없었다.
 * 수량을 고친 뒤에만 눌러야 하므로 확인창을 거친다.
 */
export default function DispatchResendButton({ jobId }: { jobId: string }) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleResend() {
    if (!confirm('수정된 수량으로 정정 문자를 다시 발송하시겠습니까?')) return
    setSending(true)
    setMsg('')
    try {
      const res = await fetch('/api/admin/orders/resend-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (data.success) {
        setMsg('재발송 완료')
        router.refresh()
      } else {
        setMsg(data.error ?? '재발송 실패')
      }
    } catch {
      setMsg('오류 발생')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
      <button
        onClick={handleResend}
        disabled={sending}
        className="text-xs px-2.5 py-1 rounded-full border border-blue-200 text-blue-700
          bg-white hover:bg-blue-50 disabled:opacity-50 font-medium"
      >
        {sending ? '발송 중…' : '재발송'}
      </button>
    </div>
  )
}
