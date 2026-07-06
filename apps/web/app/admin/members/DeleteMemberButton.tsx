'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteMemberButton({ orgId, orgName }: { orgId: string; orgName: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm(`"${orgName}"을(를) 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/members/${orgId}/delete`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '삭제 실패')
      router.push('/admin/members')
      router.refresh()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '삭제 실패')
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className="text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
    >
      {loading ? '삭제 중...' : '삭제'}
    </button>
  )
}
