'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export default function NoticeFileInput() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

    // 클라이언트에서 직접 Supabase Storage 업로드
    setUploading(true)
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

  function handleRemove() {
    setFileName(null); setPreview(null); setUploadedUrl(null); setError(null)
    const input = document.getElementById('file') as HTMLInputElement | null
    if (input) input.value = ''
  }

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      {/* 업로드된 URL을 hidden input으로 form에 포함 */}
      <input type="hidden" name="file_url" value={uploadedUrl ?? ''} />

      <label
        htmlFor="file"
        className={`cursor-pointer shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${uploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700'} text-white`}
      >
        {uploading ? '업로드 중...' : '파일 업로드'}
      </label>
      <input id="file" type="file" onChange={handleChange} disabled={uploading} className="hidden" />

      {error && <span className="text-xs text-red-500 truncate">{error}</span>}

      {!error && preview && (
        <div className="flex items-center gap-2 min-w-0">
          <img src={preview} alt="미리보기" className="h-9 w-9 rounded object-cover border border-gray-200 shrink-0" />
          <span className="text-xs text-gray-500 truncate">{fileName}</span>
          <button type="button" onClick={handleRemove} className="text-gray-400 hover:text-gray-600 shrink-0 text-lg leading-none">×</button>
        </div>
      )}
      {!error && !preview && fileName && (
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
          </svg>
          <span className="text-xs text-gray-600 truncate">{fileName}{uploadedUrl ? ' ✓' : uploading ? '' : ' (업로드 필요)'}</span>
          <button type="button" onClick={handleRemove} className="text-gray-400 hover:text-gray-600 shrink-0 text-lg leading-none">×</button>
        </div>
      )}
    </div>
  )
}
