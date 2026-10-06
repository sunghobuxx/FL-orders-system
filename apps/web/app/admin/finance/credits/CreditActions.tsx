'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 업체 1곳의 적립금 상계·환불. 상계액은 적립 잔액과 미수금 중 작은 값까지만 된다.
 * 확인창을 거쳐야 실행된다(자동 상계 없음).
 */
export default function CreditActions({ restaurantId, credit, receivable }: { restaurantId: string; credit: number; receivable: number }) {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function run(action: 'offset' | 'refund') {
    const n = Math.round(Number(amount.replace(/,/g, '')))
    if (!Number.isFinite(n) || n <= 0) {
      setMsg('금액을 입력해 주세요.')
      return
    }
    const label = action === 'offset'
      ? `적립금 ${n.toLocaleString()}원을 미수금에 상계합니다. 계속할까요?`
      : `적립금 ${n.toLocaleString()}원을 환불 처리합니다. 실제 송금은 따로 하셔야 합니다. 계속할까요?`
    if (!confirm(label)) return

    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/finance/credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, action, amount: n }),
      })
      const data = await res.json() as { error?: string; success?: boolean }
      if (!res.ok) {
        setMsg(data.error ?? '처리 실패')
        return
      }
      setAmount('')
      setMsg(action === 'offset' ? '상계 완료' : '환불 처리 완료')
      router.refresh()
    } catch {
      setMsg('요청 중 오류가 발생했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const offsetMax = Math.min(credit, receivable)

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <input
        value={amount}
        onChange={e => setAmount(e.target.value)}
        placeholder="금액"
        inputMode="numeric"
        className="w-28 border border-gray-300 rounded px-2 py-1"
        disabled={busy}
      />
      <button
        onClick={() => run('offset')}
        disabled={busy || offsetMax <= 0}
        className="px-3 py-1.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-40"
        title={offsetMax > 0 ? `최대 ${offsetMax.toLocaleString()}원` : '상계할 적립금 또는 미수금이 없습니다'}
      >
        상계
      </button>
      <button
        onClick={() => run('refund')}
        disabled={busy || credit <= 0}
        className="px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        환불
      </button>
      {msg && <span className="text-gray-500">{msg}</span>}
    </div>
  )
}
