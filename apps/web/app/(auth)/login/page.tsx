'use client'

export const runtime = 'edge'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const errorParam = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(errorParam)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

      if (authError || !data.user) {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.')
        setLoading(false)
        return
      }

      // 역할 확인 후 라우팅
      const { data: memberships, error: membershipError } = await supabase
        .from('memberships')
        .select('role, organizations(organization_type)')
        .eq('user_id', data.user.id)

      if (membershipError) {
        console.error('memberships error:', membershipError)
      }

      const isAdmin = memberships?.some(m => {
        const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations
        return (org as { organization_type: string } | null)?.organization_type === 'platform' ||
               (org as { organization_type: string } | null)?.organization_type === 'operator'
      })

      window.location.href = isAdmin ? '/admin/dashboard' : '/member/dashboard'
    } catch (err) {
      console.error('login error:', err)
      setError('로그인 중 오류가 발생했습니다. 다시 시도해주세요.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-8">
      <div className="w-full max-w-sm">
        <div className="mb-11 text-center flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="FRUIT LIFE" className="w-24 h-24 object-contain mb-3" />
          <h1 className="text-[28px] leading-tight font-extrabold text-[#111111] tracking-[0.14em]">
            FRUIT LIFE
          </h1>
          <p className="text-sm text-gray-400 mt-1">주문 관리 시스템</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
              {decodeURIComponent(error)}
            </div>
          )}

          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="이메일"
            className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-3.5 text-base text-gray-900 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />

          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="비밀번호"
            className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-3.5 text-base text-gray-900 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 text-white rounded-xl py-4 text-base font-bold hover:bg-brand-700 disabled:opacity-50 transition-colors mt-1"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
