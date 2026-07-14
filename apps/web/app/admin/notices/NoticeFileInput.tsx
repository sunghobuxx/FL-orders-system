'use client'

import { useState } from 'react'

export default function NoticeFileInput() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) {
      setFileName(null)
      setPreview(null)
      return
    }
    setFileName(file.name)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = ev => setPreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setPreview(null)
    }
  }

  function handleRemove() {
    setFileName(null)
    setPreview(null)
    const input = document.getElementById('file') as HTMLInputElement | null
    if (input) input.value = ''
  }

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <label
        htmlFor="file"
        className="cursor-pointer shrink-0 rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700"
      >
        파일 업로드
      </label>
      <input
        id="file"
        name="file"
        type="file"
        onChange={handleChange}
        className="hidden"
      />
      {preview ? (
        <div className="flex items-center gap-2 min-w-0">
          <img src={preview} alt="미리보기" className="h-9 w-9 rounded object-cover border border-gray-200 shrink-0" />
          <span className="text-xs text-gray-500 truncate">{fileName}</span>
          <button type="button" onClick={handleRemove} className="text-gray-400 hover:text-gray-600 shrink-0 text-lg leading-none">×</button>
        </div>
      ) : fileName ? (
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
          </svg>
          <span className="text-xs text-gray-600 truncate">{fileName}</span>
          <button type="button" onClick={handleRemove} className="text-gray-400 hover:text-gray-600 shrink-0 text-lg leading-none">×</button>
        </div>
      ) : null}
    </div>
  )
}
