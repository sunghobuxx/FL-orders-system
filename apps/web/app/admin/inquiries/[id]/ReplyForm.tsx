'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 문의 답변 입력.
 *
 * Server Action 으로 저장하던 것을 API 라우트 호출로 바꿨다.
 * 실패하면 이유를 화면에 그대로 보여 준다. 예전에는 그냥 오류 화면으로 넘어가
 * 무엇이 잘못됐는지 알 수 없었다.
 */
export default function ReplyForm({ inquiryId, initialReply }: { inquiryId: string; initialReply: string }) {
  const router = useRouter()
  const [reply, setReply] = useState(initialReply)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function handleSave() {
    if (!reply.trim()) {
      setMessage({ kind: 'error', text: '답변 내용을 입력하세요' })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/inquiries/${inquiryId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (data.success) {
        setMessage({ kind: 'ok', text: '답변을 저장했습니다' })
        router.refresh()
      } else {
        setMessage({ kind: 'error', text: data.error ?? '저장에 실패했습니다' })
      }
    } catch {
      setMessage({ kind: 'error', text: '네트워크 오류가 발생했습니다' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="flex gap-3 px-5 py-4">
        <span className="text-sm text-gray-500 shrink-0 pt-1">답변:</span>
        <textarea
          rows={6}
          value={reply}
          onChange={e => setReply(e.target.value)}
          placeholder="작성가능"
          className="flex-1 bg-gray-100 rounded-lg px-4 py-3 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 border-0"
        />
      </div>

      <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50">
        {message && (
          <span className={`text-xs ${message.kind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
            {message.text}
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-brand-600 text-white px-8 py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? '저장 중…' : '확인'}
        </button>
      </div>
    </>
  )
}
