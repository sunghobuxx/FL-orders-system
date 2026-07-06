'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  userId: string
  currentRole: string
  membershipId?: string
}

export default function AccountActions({ userId, currentRole, membershipId }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [role, setRole] = useState(currentRole)
  const [loading, setLoading] = useState(false)

  async function handleRoleChange() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/accounts/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, membershipId }),
      })
      if (!res.ok) { const d = await res.json(); alert(d.error ?? '수정 실패'); return }
      setEditing(false)
      router.refresh()
    } finally { setLoading(false) }
  }

  async function handleDelete() {
    if (!confirm('이 관리자 계정을 삭제하시겠습니까?\n계정이 비활성화됩니다.')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/accounts/${userId}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); alert(d.error ?? '삭제 실패'); return }
      router.refresh()
    } finally { setLoading(false) }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 justify-center">
        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="owner">오너</option>
          <option value="manager">매니저</option>
          <option value="staff">스태프</option>
        </select>
        <button onClick={handleRoleChange} disabled={loading}
          className="text-xs bg-brand-600 text-white px-2 py-1 rounded hover:bg-brand-700 disabled:opacity-50">
          저장
        </button>
        <button onClick={() => setEditing(false)}
          className="text-xs border border-gray-300 text-gray-600 px-2 py-1 rounded hover:bg-gray-50">
          취소
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 justify-center">
      <button onClick={() => setEditing(true)}
        className="text-xs border border-blue-200 text-blue-600 px-2 py-1 rounded hover:bg-blue-50">
        수정
      </button>
      <button onClick={handleDelete} disabled={loading}
        className="text-xs border border-red-200 text-red-500 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50">
        삭제
      </button>
    </div>
  )
}
