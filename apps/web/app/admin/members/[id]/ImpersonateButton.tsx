'use client'

import { useState } from 'react'

import { createClient } from '@/lib/supabase/client'

export default function ImpersonateButton({ orgId, memberEmail }: { orgId: string; memberEmail: string }) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function handleClick() {
    if (!confirm('이 회원 계정으로 로그인하면 현재 어드민 세션은 종료됩니다. 진행할까요?')) return
    setLoading(true)
    setErr('')
    try {
      // 1) 서버에서 token_hash 발급
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      })
      const data = await res.json()
      if (!res.ok || !data.tokenHash) {
        throw new Error(data.error ?? '발급 실패')
      }

      // 2) client-side verifyOtp 로 어드민 세션을 회원 세션으로 갈아끼기
      const supabase = createClient()
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        type: 'magiclink',
        token_hash: data.tokenHash,
      })
      if (verifyErr) throw new Error(`세션 전환 실패: ${verifyErr.message}`)

      // 3) 멤버 대시보드로 이동 (full reload — 서버 컴포넌트가 새 세션을 읽도록)
      window.location.href = '/member/dashboard'
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '실패')
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {err && <span className="text-xs text-red-600">{err}</span>}
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        title={`${memberEmail} 계정으로 멤버 페이지 진입 (현재 어드민 세션은 종료됨)`}
      >
        {loading ? '이동 중...' : '회원으로 로그인 →'}
      </button>
    </div>
  )
}
