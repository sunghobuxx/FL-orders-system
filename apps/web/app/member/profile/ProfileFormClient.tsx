'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  orgId: string
  restaurantId: string | null
  orgName: string
  contactName: string
  phone: string
  bizNo: string
  email: string
}

export default function ProfileFormClient({ orgId, restaurantId, orgName, contactName, phone, bizNo, email }: Props) {
  const router = useRouter()
  const [isEdit, setIsEdit] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState(orgName)
  const [cName, setCName] = useState(contactName)
  const [cPhone, setCPhone] = useState(phone)
  const [biz, setBiz] = useState(bizNo)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const res = await fetch('/api/member/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, restaurantId, name, contact_name: cName, phone: cPhone, biz_no: biz }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? '수정 실패')
      }
      setIsEdit(false)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  const F = ({ children }: { children: React.ReactNode }) => (
    <span className="flex-1 bg-gray-100 px-3 py-1.5 rounded text-sm text-gray-800">{children || '-'}</span>
  )
  const I = ({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) => (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      disabled={isLoading}
      className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 border-0 disabled:opacity-50" />
  )

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {error && <div className="px-4 py-3 bg-red-50 border-b border-red-200 text-sm text-red-700">{error}</div>}

      {/* 업체명 + 대표자 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 shrink-0 w-16">제목:</span>
          {isEdit ? <I value={name} onChange={setName} /> : <F>{name}</F>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 shrink-0 w-16">대표자:</span>
          {isEdit ? <I value={cName} onChange={setCName} /> : <F>{cName}</F>}
        </div>
      </div>

      {/* 주소 */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-100">
        <span className="text-sm text-gray-500 shrink-0 w-16">주소:</span>
        <span className="flex-1 bg-gray-100 px-3 py-1.5 rounded text-sm text-gray-400">(관리자 문의)</span>
      </div>

      {/* 전화번호 + 이메일 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 shrink-0 w-16">전화번호:</span>
          {isEdit ? <I value={cPhone} onChange={setCPhone} type="tel" placeholder="010-0000-0000" /> : <F>{cPhone}</F>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 shrink-0 w-16">이메일:</span>
          <span className="flex-1 bg-gray-100 px-3 py-1.5 rounded text-sm text-gray-500 truncate">{email}</span>
        </div>
      </div>

      {/* 사업자등록번호 */}
      <div className="flex gap-2 px-4 py-4 border-b border-gray-100">
        <span className="text-sm text-gray-500 shrink-0 w-16 pt-1">사업자:</span>
        <div className="flex-1 bg-gray-100 rounded-lg px-4 py-3 min-h-16 flex items-center">
          {isEdit
            ? <input value={biz} onChange={e => setBiz(e.target.value)} placeholder="000-00-00000" disabled={isLoading}
                className="w-full bg-white rounded px-3 py-1 text-sm focus:outline-none border border-gray-200 disabled:opacity-50" />
            : <span className="text-sm text-gray-700">{biz || '-'}</span>
          }
        </div>
      </div>

      {/* 버튼 */}
      <div className="flex justify-center gap-3 px-4 py-4 border-t border-gray-100 bg-gray-50">
        {isEdit ? (
          <>
            <button type="submit" disabled={isLoading}
              className="flex-1 md:flex-none rounded-lg bg-brand-600 text-white px-6 py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
              {isLoading ? '저장 중...' : '확인'}
            </button>
            <button type="button" disabled={isLoading} onClick={() => { setIsEdit(false); setError('') }}
              className="flex-1 md:flex-none rounded-lg border border-gray-300 text-gray-700 px-6 py-2.5 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">
              취소
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setIsEdit(true)}
            className="flex-1 md:flex-none rounded-lg bg-brand-600 text-white px-6 py-2.5 text-sm font-semibold hover:bg-brand-700">
            수정
          </button>
        )}
      </div>
    </form>
  )
}
