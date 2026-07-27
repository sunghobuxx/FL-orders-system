'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 활성/비활성 전환 버튼.
 * 비활성으로 두면 목록에서 숨겨지고 거래 이력은 그대로 남는다.
 * 회원(members)과 품목(products) 양쪽에서 같은 모양으로 쓴다.
 */
export default function StatusToggleButton({
  endpoint,
  name,
  status,
}: {
  endpoint: string
  name: string
  status: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const isActive = status !== 'inactive'
  const next = isActive ? 'inactive' : 'active'

  async function handleToggle() {
    const label = isActive ? '비활성' : '활성'
    if (!confirm(`"${name}"을(를) ${label}으로 변경할까요?${isActive ? '\n목록에서 보이지 않게 됩니다.' : ''}`)) return
    setLoading(true)
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? '상태 변경 실패')
      router.refresh()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '상태 변경 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={loading}
      className={`text-sm px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
        isActive
          ? 'text-gray-600 border-gray-300 hover:bg-gray-50'
          : 'text-green-700 border-green-300 hover:bg-green-50'
      }`}
    >
      {loading ? '변경 중...' : isActive ? '비활성' : '활성으로'}
    </button>
  )
}
