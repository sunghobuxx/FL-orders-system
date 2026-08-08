'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import NoticeFileInput from './NoticeFileInput'

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
    const res = await fetch(`/api/admin/notices/${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({})) as { error?: string }
    if (!res.ok) {
      alert(data.error ?? '삭제에 실패했습니다.')
      setLoading(false)
    } else {
      router.push('/admin/notices')
      router.refresh()
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

export function EditNoticeForm({ id, title, body, filePath }: {
  id: string; title: string; body: string; filePath?: string | null
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  // 첨부 상태를 받아 둔다. 업로드가 끝나기 전에는 저장을 막고,
  // 첨부를 뗐으면 null 을 보내 지운다.
  const [attach, setAttach] = useState<{ url: string | null; blocked: boolean }>({
    url: filePath ?? null, blocked: false,
  })

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (attach.blocked) return
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    const res = await fetch(`/api/admin/notices/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: fd.get('title'), body: fd.get('body'), file_path: attach.url }),
    })
    const data = await res.json().catch(() => ({})) as { error?: string }
    if (!res.ok) {
      alert(data.error ?? '수정에 실패했습니다.')
      setLoading(false)
    } else {
      router.push(`/admin/notices/${id}`)
      router.refresh()
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
      {/* 첨부. 새 글 화면과 같은 컴포넌트를 쓴다 — 저장 버튼은 이 폼 것을 쓰므로
          withSubmit 은 끄고, 업로드 상태만 받아 저장을 막는다. */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
        <span className="text-sm text-gray-500 shrink-0">첨부:</span>
        <NoticeFileInput defaultUrl={filePath ?? null} withSubmit={false} onChange={setAttach} />
      </div>
      <div className="flex justify-end gap-2 px-5 py-4">
        <button type="submit" disabled={loading || attach.blocked}
          title={attach.blocked ? '파일 업로드가 끝난 뒤에 저장할 수 있습니다' : undefined}
          className="rounded-lg bg-brand-600 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed">
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
