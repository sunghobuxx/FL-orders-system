'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ImageUpload({
  productId,
  imagePath,
}: {
  productId: string
  imagePath: string | null
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<string | null>(imagePath)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('productId', productId)
      const res = await fetch('/api/admin/products/image', { method: 'POST', body: form })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok) { alert(data.error ?? '업로드 실패'); return }
      setPreview(data.url ?? null)
      router.refresh()
    } catch {
      alert('업로드 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      {preview && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={preview} alt="품목 이미지" className="w-24 h-24 rounded-lg object-cover border border-gray-200" />
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? '업로드 중...' : preview ? '이미지 변경' : '이미지 등록'}
        </button>
        {preview && !loading && (
          <span className="text-xs text-gray-400">이미지가 등록되어 있습니다</span>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}
