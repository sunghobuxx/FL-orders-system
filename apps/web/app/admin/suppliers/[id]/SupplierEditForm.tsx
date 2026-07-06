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

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="divide-y divide-gray-100">
        <div className="flex items-center gap-3 px-5 py-4">
          <label className="text-sm text-gray-500 w-24 shrink-0">공급처명 *</label>
          <input
            type="text" required value={form.name}
            onChange={e => set('name', e.target.value)}
            className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex items-center gap-3 px-5 py-4">
          <label className="text-sm text-gray-500 w-24 shrink-0">발주 채널</label>
          <select
            value={form.dispatch_channel} onChange={e => set('dispatch_channel', e.target.value)}
            className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="kakao">카카오</option>
            <option value="sms">SMS</option>
            <option value="email">이메일</option>
          </select>
        </div>
        <div className="flex items-center gap-3 px-5 py-4">
          <label className="text-sm text-gray-500 w-24 shrink-0">연락처</label>
          <input
            type="tel" value={form.phone}
            onChange={e => set('phone', e.target.value)}
            placeholder="010-0000-0000"
            className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex items-center gap-3 px-5 py-4">
          <label className="text-sm text-gray-500 w-24 shrink-0">상태</label>
          <select
            value={form.status} onChange={e => set('status', e.target.value)}
            className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="active">활성</option>
            <option value="inactive">비활성</option>
          </select>
        </div>
      </div>
      <div className="flex justify-center gap-3 px-5 py-4 bg-gray-50">
        <button type="submit" disabled={loading}
          className="rounded-lg bg-brand-600 text-white px-8 py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
          {loading ? '저장 중...' : '저장'}
        </button>
        <a href="/admin/suppliers"
          className="rounded-lg border border-gray-300 text-gray-700 px-8 py-2.5 text-sm font-semibold hover:bg-gray-50">
          목록으로
        </a>
      </div>
    </form>
  )
}
