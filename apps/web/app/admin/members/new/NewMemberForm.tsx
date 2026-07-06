'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  orgType: string
  products: { id: string; standard_name: string; default_unit: string }[]
}

export default function NewMemberForm({ orgType, products }: Props) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const isSupplier = orgType === 'supplier'

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    const form = e.currentTarget
    const fd = new FormData(form)

    const selectedProducts = fd.getAll('product_ids') as string[]

    const body = {
      name: fd.get('name'),
      contact_name: fd.get('contact_name'),
      phone: fd.get('phone'),
      biz_no: fd.get('biz_no'),
      settlement_cycle: fd.get('settlement_cycle') ?? 'weekly',
      org_type: orgType,
      product_ids: selectedProducts,
      email: fd.get('email') || null,
      password: fd.get('password') || 'aaaa1111',
    }

    try {
      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '등록 실패')
      // 부분 실패 경고 (org 는 만들어졌지만 계정/멤버십 누락 같은 경우)
      if (data.warning) {
        alert(`⚠️ ${data.warning}`)
      }
      router.push(`/admin/members/${data.orgId}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '등록 실패')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {error && (
        <div className="px-5 py-3 bg-red-50 border-b border-red-200 text-sm text-red-700">{error}</div>
      )}

      {/* 상호명 + 대표자 */}
      <div className="grid grid-cols-2 gap-4 px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500 shrink-0">상호명:</label>
          <input name="name" required placeholder="상호명"
            className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500 shrink-0">대표자:</label>
          <input name="contact_name" placeholder="대표자명"
            className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      </div>

      {/* 전화번호 */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
        <label className="text-sm text-gray-500 shrink-0">전화번호:</label>
        <input name="phone" type="tel" placeholder="010-0000-0000"
          className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      {/* 사업자등록번호 */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
        <label className="text-sm text-gray-500 shrink-0">사업자번호:</label>
        <input name="biz_no" placeholder="000-00-00000"
          className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      {/* 로그인 계정 (이메일 + 초기 비밀번호) */}
      <div className="px-5 py-4 border-b border-gray-100 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">로그인 계정 설정</p>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500 shrink-0 w-20">이메일:</label>
          <input name="email" type="email" placeholder="account@example.com"
            className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500 shrink-0 w-20">초기 비밀번호:</label>
          <input name="password" type="text" placeholder="aaaa1111 (미입력 시 기본값)"
            className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <p className="text-xs text-gray-400">이메일 입력 시 해당 이메일로 로그인 계정이 자동 생성됩니다</p>
      </div>

      {/* 정산 주기 (매출 업체만) */}
      {!isSupplier && (
        <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-100">
          <span className="text-sm text-gray-500 shrink-0">정산 주기:</span>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="settlement_cycle" value="weekly" defaultChecked
                className="accent-brand-600" />
              <span className="font-medium">주정산</span>
              <span className="text-gray-400 text-xs">— 월~토 마감</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="settlement_cycle" value="monthly"
                className="accent-brand-600" />
              <span className="font-medium">월정산</span>
              <span className="text-gray-400 text-xs">— 매월 말 마감</span>
            </label>
          </div>
        </div>
      )}

      {/* 취급 품목 (매입처만) */}
      {isSupplier && products.length > 0 && (
        <div className="flex gap-3 px-5 py-4 border-b border-gray-100">
          <span className="text-sm text-gray-500 shrink-0 pt-1">취급 품목:</span>
          <div className="flex flex-wrap gap-2">
            {products.map(p => (
              <label key={p.id}
                className="flex items-center gap-1.5 text-xs bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-gray-100">
                <input type="checkbox" name="product_ids" value={p.id} className="accent-brand-600" />
                {p.standard_name}
                <span className="text-gray-400">({p.default_unit})</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-center gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50">
        <button type="submit" disabled={isLoading}
          className="rounded-lg bg-brand-600 text-white px-8 py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
          {isLoading ? '등록 중...' : '확인'}
        </button>
        <a href="/admin/members"
          className="rounded-lg border border-gray-300 text-gray-700 px-8 py-2.5 text-sm font-semibold hover:bg-gray-50">
          취소
        </a>
      </div>
    </form>
  )
}
