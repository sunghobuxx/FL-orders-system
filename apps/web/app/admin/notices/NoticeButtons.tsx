'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function DeleteNoticeButton({ id }: { id: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm('이 공지를 삭제하시겠습니까?')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/notices/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('삭제 실패')
      router.push('/admin/notices')
      router.refresh()
    } catch {
      alert('삭제에 실패했습니다.')
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className="rounded-lg border border-red-200 text-red-500 hover:border-red-400 hover:text-red-700 px-5 py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
    >
      {loading ? '삭제 중...' : '삭제'}
    </button>
  )
}

export function EditNoticeForm({ id, title, body }: { id: string; title: string; body: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    try {
      const res = await fetch(`/api/admin/notices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: fd.get('title'), body: fd.get('body') }),
      })
      if (!res.ok) throw new Error('수정 실패')
      router.push(`/admin/notices/${id}`)
      router.refresh()
    } catch {
      alert('수정에 실패했습니다.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
        <span className="text-sm text-gray-500 shrink-0">제목:</span>
        <input name="title" defaultValue={title} required
          className="flex-1 bg-gray-100 rounded px-4 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 border-0" />
      </div>
      <div className="flex gap-3 px-5 py-4 border-b border-gray-100">
        <span className="text-sm text-gray-500 shrink-0 pt-1">내용:</span>
        <textarea name="body" defaultValue={body} required rows={9}
          className="flex-1 bg-gray-100 rounded px-4 py-3 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 border-0" />
      </div>
      <div className="flex justify-end gap-2 px-5 py-4">
        <button type="submit" disabled={loading}
          className="rounded-lg bg-brand-600 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
          {loading ? '저장 중...' : '확인'}
        </button>
        <a href={`/admin/notices/${id}`}
          className="rounded-lg border border-gray-300 text-gray-700 px-5 py-2 text-sm font-semibold hover:bg-gray-50">
          취소
        </a>
      </div>
    </form>
  )
}
