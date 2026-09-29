'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 업체 1곳·달력상 한 달 세금계산서 발행 버튼. TAX_INVOICE_ISSUE_ENABLED 가 꺼져 있으면(기본값)
 * 눌러도 403 안내만 뜬다 — 사업자번호·대표자명이 없는 업체가 아직 있어(2026-09-30) 켜기 전이다.
 */
export default function IssueTaxInvoiceButton({ restaurantId, month, disabled }: { restaurantId: string; month: string; disabled?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function handleClick() {
    if (!confirm(`${month} 월합계 세금계산서를 발행합니다. 계속할까요?`)) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/finance/tax-invoices/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, month }),
      })
      const data = await res.json() as { error?: string; alreadyIssued?: boolean }
      if (!res.ok) {
        setMsg(data.error ?? '발행 실패')
        return
      }
      setMsg(data.alreadyIssued ? '이미 발행된 세금계산서입니다.' : '발행 완료')
      router.refresh()
    } catch {
      setMsg('요청 중 오류가 발생했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={busy || disabled}
        className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        {busy ? '발행 중…' : '발행'}
      </button>
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
    </div>
  )
}
