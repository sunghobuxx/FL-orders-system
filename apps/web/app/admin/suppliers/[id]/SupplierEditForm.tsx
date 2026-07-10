'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface SupplierData {
  supplierId: string
  name: string
  dispatch_channel: string | null
  status: string
  phone: string | null
}

export default function SupplierEditForm({ data }: { data: SupplierData }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: data.name,
    dispatch_channel: data.dispatch_channel ?? 'kakao',
    status: data.status,
    phone: data.phone ?? '',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { alert('공급처명을 입력하세요'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/suppliers/${data.supplierId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const result = await res.json() as { success?: boolean; error?: string }
      if (!res.ok) throw new Error(result.error ?? '수정 실패')
      alert('저장되었습니다')
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm('이 공급처를 비활성화하시겠습니까?')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/suppliers/${data.supplierId}`, { method: 'DELETE' })
      const result = await res.json() as { success?: boolean; error?: string }
      if (!res.ok) throw new Error(result.error ?? '삭제 실패')
      router.push('/admin/suppliers')
    } catch (e) {
      alert(e instanceof Error ? e.message : '오류 발생')
      setLoading(false)
    }
  }

  const inputClass = 'w-full border border-gray-200 rounded-lg px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5'

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div>
        <label htmlFor="s-name" className={labelClass}>공급처명 <span className="text-red-500">*</span></label>
        <input
          id="s-name" type="text" required value={form.name}
          onChange={e => set('name', e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="s-phone" className={labelClass}>연락처 (발주 수신 전화번호)</label>
        <input
          id="s-phone" type="tel" value={form.phone}
          onChange={e => set('phone', e.target.value)}
          placeholder="010-0000-0000"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="s-channel" className={labelClass}>발주 채널 <span className="text-red-500">*</span></label>
        <select
          id="s-channel" value={form.dispatch_channel} onChange={e => set('dispatch_channel', e.target.value)}
          className={inputClass}
        >
          <option value="kakao">카카오톡</option>
          <option value="sms">SMS</option>
          <option value="email">이메일</option>
        </select>
      </div>
      <div>
        <label htmlFor="s-status" className={labelClass}>상태</label>
        <select
          id="s-status" value={form.status} onChange={e => set('status', e.target.value)}
          className={inputClass}
        >
          <option value="active">활성</option>
          <option value="inactive">비활성</option>
        </select>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className="px-4 py-2.5 rounded-lg border border-red-300 text-red-500 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
        >
          삭제
        </button>
        <a
          href="/admin/suppliers"
          className="flex-1 text-center py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50"
        >
          취소
        </a>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? '저장 중...' : '저장'}
        </button>
      </div>
    </form>
  )
}
