'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 02:30 자동발송 이후 들어온 발주만 따로 보낸다.
 *
 * 재발송은 02:30 스냅샷을 그대로 다시 보내기 때문에 그 뒤에 추가된 품목이 빠진다.
 * 이 버튼은 빠진 품목만 골라 "[추가발주]" 로 보낸다. 하루 한 번만 보낼 수 있다.
 */
export default function DispatchAdditionalButton({
  supplierId,
  businessDate,
  count,
}: {
  supplierId: string
  businessDate: string
  count: number
}) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleSend() {
    if (!confirm(`02:30 이후 추가된 ${count}개 품목만 추가발주 문자로 보냅니다. 보내시겠습니까?`)) return
    setSending(true)
    setMsg('')
    try {
      const res = await fetch('/api/admin/orders/additional-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId, businessDate }),
      })
      const data = await res.json() as { success?: boolean; sentCount?: number; error?: string }
      if (data.success) {
        setMsg(`${data.sentCount}개 발송 완료`)
        router.refresh()
      } else {
        setMsg(data.error ?? '발송 실패')
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
        onClick={handleSend}
        disabled={sending}
        className="text-xs px-2.5 py-1 rounded-full border border-amber-300 text-amber-700
          bg-amber-50 hover:bg-amber-100 disabled:opacity-50 font-medium"
      >
        {sending ? '발송 중…' : `추가발주 ${count}`}
      </button>
    </div>
  )
}
