'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function InquiryForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fileNames, setFileNames] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileChange() {
    const files = fileRef.current?.files
    if (!files) return
    setFileNames(Array.from(files).map(f => f.name))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const title = (form.elements.namedItem('title') as HTMLInputElement).value
    const content = (form.elements.namedItem('content') as HTMLTextAreaElement).value

    setError(null)
    startTransition(async () => {
      const res = await fetch('/api/member/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      })
      const data = await res.json() as { error?: string }
      if (data.error) {
        setError(data.error)
      } else {
        router.push('/member/inquiries')
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* 제목 */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
        <span className="text-sm text-gray-500 shrink-0">제목:</span>
        <input
          name="title"
          required
          placeholder="제목을 입력하세요"
          className="flex-1 bg-gray-100 rounded px-4 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 border-0"
        />
      </div>

      {/* 내용 */}
      <div className="flex gap-3 px-5 py-4 border-b border-gray-100">
        <span className="text-sm text-gray-500 shrink-0 pt-1">내용:</span>
        <textarea
          name="content"
          required
          rows={8}
          placeholder="문의 내용을 입력해주세요"
          className="flex-1 bg-gray-100 rounded px-4 py-3 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 border-0"
        />
      </div>

      {/* 파일명 표시 */}
      {fileNames.length > 0 && (
        <div className="px-5 py-2 border-b border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500 mb-1">첨부 파일:</p>
          <div className="flex flex-wrap gap-1">
            {fileNames.map(name => (
              <span key={name} className="text-xs bg-brand-50 text-brand-700 border border-brand-200 rounded px-2 py-0.5">
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 오류 메시지 */}
      {error && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-100 text-sm text-red-600">{error}</div>
      )}

      {/* 버튼 */}
      <div className="flex justify-end gap-2 px-5 py-4">
        <label htmlFor="images"
          className="cursor-pointer rounded-lg bg-gray-100 text-gray-700 border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-200">
          파일 업로드
        </label>
        <input
          ref={fileRef}
          id="images"
          name="images"
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <button type="submit" disabled={isPending}
          className="rounded-lg bg-brand-600 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
          {isPending ? '등록 중...' : '확인'}
        </button>
        <a href="/member/inquiries"
          className="rounded-lg border border-gray-300 text-gray-700 px-5 py-2 text-sm font-semibold hover:bg-gray-50">
          취소
        </a>
      </div>
    </form>
  )
}
