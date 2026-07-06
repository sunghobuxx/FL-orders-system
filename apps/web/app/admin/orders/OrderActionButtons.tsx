'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function OrderActionButtons({ businessDate }: { businessDate: string }) {
  const router = useRouter()
  const [validating, setValidating] = useState(false)
  const [generating, setGenerating] = useState(false)

  async function handleValidate() {
    if (!confirm(`${businessDate} 발주를 확정하시겠습니까?\n(알림톡은 새벽 2:30 자동 발송됩니다)`)) return
    setValidating(true)
    try {
      const res = await fetch('/api/admin/orders/validate-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessDate }),
      })
      const data = await res.json() as { success?: boolean; error?: string; validated?: number }
      if (!res.ok) throw new Error(data.error ?? '발주 확정 실패')
      alert(`발주 확정 완료 (${data.validated ?? 0}건)`)
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setValidating(false)
    }
  }

  async function handleGenerateSpecs() {
    if (!confirm(`${businessDate} 명세서를 생성하시겠습니까?\n기존 명세서가 있으면 덮어씁니다.`)) return
    setGenerating(true)
    try {
      const res = await fetch('/api/admin/orders/generate-specs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessDate }),
      })
      const data = await res.json() as { success?: boolean; error?: string; created?: number }
      if (!res.ok) throw new Error(data.error ?? '명세서 생성 실패')
      alert(`명세서 ${data.created ?? 0}건 생성 완료`)
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setGenerating(false)
    }
  }

  const month = businessDate.slice(0, 7)

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleValidate}
        disabled={validating}
        className="text-sm px-4 py-2 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50"
      >
        {validating ? '처리 중...' : '발주 확정'}
      </button>
      <button
        type="button"
        onClick={handleGenerateSpecs}
        disabled={generating}
        className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-white font-semibold hover:bg-gray-800 disabled:opacity-50"
      >
        {generating ? '생성 중...' : '명세서 생성'}
      </button>
      <Link
        href={`/admin/settlement/specs?date=${businessDate}`}
        className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50"
      >
        명세서 확인
      </Link>
    </div>
  )
}
