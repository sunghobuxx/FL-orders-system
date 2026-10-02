'use client'

import { useId, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// 사업자등록증은 비공개 버킷(biz-licenses)에 올린다. 공지 첨부와 달리 getPublicUrl 을 안 쓰고
// storage 경로(path)만 저장해 둔다 — 열람은 그때그때 서명된 URL(/biz-license API)로만 한다.

interface Props {
  orgId: string
  defaultPath?: string | null
  editable: boolean
  disabled?: boolean
}

export default function BizLicenseUpload({ orgId, defaultPath = null, editable, disabled }: Props) {
  const inputId = useId()
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedPath, setUploadedPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState(false)

  const effectivePath = uploadedPath ?? defaultPath

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError(null)
    setUploadedPath(null)
    setUploading(true)

    const supabase = createClient()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${orgId}/${Date.now()}_${safeName}`
    const { data, error: uploadError } = await supabase.storage
      .from('biz-licenses')
      .upload(path, file, { cacheControl: '3600', upsert: false })
    setUploading(false)

    if (uploadError) {
      setError(`업로드 실패: ${uploadError.message}`)
      return
    }
    setUploadedPath(data.path)
  }

  async function handleView() {
    setViewing(true)
    try {
      const res = await fetch(`/api/admin/members/${orgId}/biz-license`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? '열람 실패')
      window.open(d.url, '_blank', 'noopener,noreferrer')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '열람 실패')
    } finally {
      setViewing(false)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      {editable && <input type="hidden" name="biz_license_path" value={effectivePath ?? ''} />}

      {editable && (
        <>
          <label
            htmlFor={inputId}
            className={`cursor-pointer shrink-0 rounded px-3 py-1.5 text-xs font-semibold ${uploading || disabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700'} text-white`}
          >
            {uploading ? '업로드 중...' : effectivePath ? '파일 변경' : '파일 업로드'}
          </label>
          <input id={inputId} type="file" onChange={handleChange} disabled={uploading || disabled} className="hidden" />
        </>
      )}

      {error && <span className="text-xs text-red-500 truncate">{error}</span>}
      {!error && fileName && <span className="text-xs text-gray-600 truncate">{fileName}{uploadedPath ? ' ✓' : ''}</span>}

      {!fileName && effectivePath && (
        <button type="button" onClick={handleView} disabled={viewing}
          className="text-xs text-brand-600 hover:text-brand-800 underline shrink-0">
          {viewing ? '불러오는 중...' : '📎 보기'}
        </button>
      )}
      {!fileName && !effectivePath && !editable && (
        <span className="text-xs text-gray-400">등록된 파일 없음</span>
      )}
    </div>
  )
}
