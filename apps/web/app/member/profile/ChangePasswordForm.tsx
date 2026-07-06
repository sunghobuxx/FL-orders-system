'use client'

import { useState } from 'react'

import { createClient } from '@/lib/supabase/client'

export function ChangePasswordForm() {
  const [open, setOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  function handleToggle() {
    setOpen(prev => !prev)
    setNewPassword('')
    setConfirmPassword('')
    setStatus('idle')
    setErrorMsg('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')

    if (newPassword.length < 8) {
      setErrorMsg('비밀번호는 8자 이상이어야 합니다.')
      return
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('새 비밀번호가 일치하지 않습니다.')
      return
    }

    setStatus('loading')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setErrorMsg(error.message)
      setStatus('error')
    } else {
      setStatus('success')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 text-left"
      >
        <h2 className="text-sm font-semibold text-gray-700">비밀번호 변경</h2>
        <span className="text-xs text-brand-600 font-medium">{open ? '닫기' : '변경하기'}</span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 shrink-0 w-24">새 비밀번호</span>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="8자 이상 입력"
              required
              className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 border-0"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 shrink-0 w-24">비밀번호 확인</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="새 비밀번호 재입력"
              required
              className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 border-0"
            />
          </div>

          {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
          {status === 'success' && (
            <p className="text-xs text-green-600 font-medium">✅ 비밀번호가 변경되었습니다.</p>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={status === 'loading'}
              className="rounded-lg bg-brand-600 text-white px-6 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
            >
              {status === 'loading' ? '변경 중...' : '변경'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
