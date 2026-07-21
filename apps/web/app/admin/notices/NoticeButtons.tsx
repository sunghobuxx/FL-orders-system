'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteNotice, updateNotice } from './actions'

export function NoticeSmsButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ successCount: number; failCount: number; results: { org: string; phone: string; success: boolean; error?: string }[] } | null>(null)

  async function handleSend() {
    if (!confirm('전화번호가 등록된 매출업체에 SMS를 발송하시겠습니까?')) return
    setLoading(true)
    setResult(null)
    const res = await fetch(`/api/admin/notices/${id}/send-sms`, { method: 'POST' })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { alert(data.error ?? 'SMS 발송 실패'); return }
    setResult(data)
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleSend}
        disabled={loading}
        className="rounded-lg bg-green-600 text-white px-5 py-2 text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? '발송 중...' : 'SMS 발송'}
      </button>
      {result && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs space-y-1">
          <p className="font-semibold text-gray-700">
            발송 완료: {result.successCount}건 성공 / {result.failCount}건 실패
          </p>
          {result.results.map((r) => (
            <p key={r.phone} className={r.success ? 'text-gray-500' : 'text-red-500'}>
              {r.success ? '✓' : '✗'} {r.org} ({r.phone}){r.error ? ` — ${r.error}` : ''}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

export function DeleteNoticeButton({ id }: { id: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm('이 공지를 삭제하시겠습니까?')) return
    setLoading(true)
    const result = await deleteNotice(id)
    if (result.error) {
      alert('삭제에 실패했습니다.')
      setLoading(false)
    } else {
      router.push('/admin/notices')
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
    const result = await updateNotice(id, fd.get('title') as string, fd.get('body') as string)
    if (result.error) {
      alert('수정에 실패했습니다.')
      setLoading(false)
    } else {
      router.push(`/admin/notices/${id}`)
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
