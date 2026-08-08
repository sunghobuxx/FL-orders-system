'use client'

import { useEffect, useId, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// 세션을 물고 가는 브라우저 클라이언트를 쓴다.
// 예전에는 supabase-js 로 anon 클라이언트를 따로 만들어 로그인 정보가 실리지 않았다.
// 그러면 스토리지에 익명으로 올리는 셈이라, 아무나 올릴 수 있게 열어 두지 않는 한 막힌다.
// 업로드 권한은 공지 관리자로 좁혀 두었다(storage 정책 notices_admin_write).

/** "1786127264669_FruitLife-1.0.3.apk" → "FruitLife-1.0.3.apk" */
function fileNameOf(url: string) {
  try {
    return decodeURIComponent(url.split('/').pop() ?? '').replace(/^\d+_/, '') || '첨부파일'
  } catch {
    return '첨부파일'
  }
}

interface Props {
  /** 이미 붙어 있는 첨부(수정 화면). 새로 고르면 이걸 대체한다. */
  defaultUrl?: string | null
  /**
   * 등록·취소 버튼을 같이 그릴지. 새 글 화면은 서버 액션 폼이라 여기서 그려야
   * 업로드 중에 등록을 막을 수 있다. 수정 화면은 자기 저장 버튼을 쓰므로 false.
   */
  withSubmit?: boolean
  /** 바깥 폼이 저장 버튼을 막을 수 있게 상태를 알려 준다. */
  onChange?: (v: { url: string | null; blocked: boolean }) => void
}

export default function NoticeFileInput({ defaultUrl = null, withSubmit = true, onChange }: Props) {
  const inputId = useId()
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 기존 첨부를 뗀 상태. 저장하면 첨부가 없어진다. */
  const [removedExisting, setRemovedExisting] = useState(false)

  const existingUrl = removedExisting ? null : defaultUrl
  // 파일을 골랐는데 아직 안 올라간 상태. 이대로 저장하면 첨부 없이 저장된다.
  // 파일명은 고르는 즉시 보이므로 «올라간 것처럼» 보이는 게 문제였다.
  // (2026-08-08 공지 2건이 이렇게 첨부 없이 저장됐다)
  const pending = Boolean(fileName) && !uploadedUrl
  const blocked = uploading || pending
  const effectiveUrl = uploadedUrl ?? existingUrl

  useEffect(() => {
    onChange?.({ url: effectiveUrl, blocked })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUrl, blocked])

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) { setFileName(null); setPreview(null); setUploadedUrl(null); return }

    setFileName(file.name)
    setError(null)
    setUploadedUrl(null)

    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = ev => setPreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setPreview(null)
    }

    setUploading(true)
    const supabase = createClient()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${Date.now()}_${safeName}`
    const { data, error: uploadError } = await supabase.storage
      .from('notices')
      .upload(path, file, { cacheControl: '3600', upsert: false })
    setUploading(false)

    if (uploadError) {
      setError(`업로드 실패: ${uploadError.message}`)
      return
    }
    const { data: { publicUrl } } = supabase.storage.from('notices').getPublicUrl(data.path)
    setUploadedUrl(publicUrl)
  }

  function clearPicked() {
    setFileName(null); setPreview(null); setUploadedUrl(null); setError(null)
    const input = document.getElementById(inputId) as HTMLInputElement | null
    if (input) input.value = ''
  }

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      {/* 서버 액션 폼(새 글)이 읽는 값. 수정 화면은 onChange 로 받아 간다. */}
      <input type="hidden" name="file_url" value={effectiveUrl ?? ''} />

      <label
        htmlFor={inputId}
        className={`cursor-pointer shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${uploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700'} text-white`}
      >
        {uploading ? '업로드 중...' : existingUrl && !fileName ? '파일 변경' : '파일 업로드'}
      </label>
      <input id={inputId} type="file" onChange={handleChange} disabled={uploading} className="hidden" />

      {error && <span className="text-xs text-red-500 truncate">{error}</span>}

      {!error && pending && !uploading && (
        <span className="text-xs text-red-600 font-semibold shrink-0">업로드 안 됨</span>
      )}

      {/* 새로 고른 파일 */}
      {!error && fileName && (
        <div className="flex items-center gap-2 min-w-0">
          {preview && <img src={preview} alt="미리보기" className="h-9 w-9 rounded object-cover border border-gray-200 shrink-0" />}
          <span className="text-xs text-gray-600 truncate">{fileName}{uploadedUrl ? ' ✓' : ''}</span>
          <button type="button" onClick={clearPicked} className="text-gray-400 hover:text-gray-600 shrink-0 text-lg leading-none">×</button>
        </div>
      )}

      {/* 이미 붙어 있는 첨부 (수정 화면) */}
      {!fileName && existingUrl && (
        <div className="flex items-center gap-2 min-w-0">
          <a
            href={existingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-brand-600 hover:text-brand-800 truncate"
          >
            📎 {fileNameOf(existingUrl)}
          </a>
          <button
            type="button"
            onClick={() => setRemovedExisting(true)}
            title="첨부 떼기"
            className="text-gray-400 hover:text-red-500 shrink-0 text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}
      {!fileName && removedExisting && defaultUrl && (
        <span className="text-xs text-gray-400 shrink-0">
          첨부 뗌 —{' '}
          <button type="button" onClick={() => setRemovedExisting(false)} className="underline hover:text-gray-600">
            되돌리기
          </button>
        </span>
      )}

      {withSubmit && (
        // 업로드가 끝나기 전이나 실패 상태에서는 누르지 못하게 막는다.
        // 버튼이 다른 컴포넌트에 있으면 이 상태를 알 수가 없어 여기서 그린다.
        <div className="flex gap-2 shrink-0 ml-auto">
          <button
            type="submit"
            disabled={blocked}
            title={blocked ? '파일 업로드가 끝난 뒤에 등록할 수 있습니다' : undefined}
            className="rounded-lg bg-brand-600 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? '업로드 중...' : '확인'}
          </button>
          <a
            href="/admin/notices"
            className="rounded-lg border border-gray-300 text-gray-700 px-5 py-2 text-sm font-semibold hover:bg-gray-50"
          >
            취소
          </a>
        </div>
      )}
    </div>
  )
}
