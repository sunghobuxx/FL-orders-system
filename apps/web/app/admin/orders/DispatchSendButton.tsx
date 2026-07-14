'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DispatchSendButton({
  supplierId,
  businessDate,
}: {
  supplierId: string
  businessDate: string
}) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleSend() {
    if (!confirm('이 공급처에 발주 문자를 발송하시겠습니까?')) return
    setSending(true)
    setMsg('')
    try {
      const res = await fetch('/api/admin/orders/confirm-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId, businessDate }),
      })
      const data = await res.json() as { success?: boolean; error?: string; alreadySent?: boolean }
      if (data.alreadySent) {
        setMsg('이미 발송됨')
      } else if (data.success) {
        setMsg('발송 완료')
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
      {msg && (
        <span className={`text-xs ${msg === '발송 완료' || msg === '이미 발송됨' ? 'text-green-600' : 'text-red-500'}`}>
          {msg}
        </span>
      )}
      <button
        type="button"
        onClick={handleSend}
        disabled={sending}
        className="text-sm px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 font-semibold whitespace-nowrap"
      >
        {sending ? '발송 중...' : '발주 발송'}
      </button>
    </div>
  )
}
