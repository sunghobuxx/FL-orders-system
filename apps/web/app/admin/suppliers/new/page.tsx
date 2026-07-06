'use client'

export const runtime = 'edge'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function AdminSupplierNewPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    dispatch_channel: 'kakao',
    phone: '',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { alert('공급처명을 입력하세요'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json() as { success?: boolean; error?: string; supplierId?: string }
      if (!res.ok) throw new Error(data.error ?? '등록 실패')
      alert('공급처가 등록되었습니다')
      router.push('/admin/suppliers')
    } catch (e) {
      alert(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-lg space-y-4">
      <div className="flex items-center gap-3">
        <a href="/admin/suppliers" className="text-sm text-gray-400 hover:text-gray-700">← 목록</a>
        <h1 className="text-lg font-bold text-gray-900">공급처 등록</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="divide-y divide-gray-100">
          <div className="flex items-center gap-3 px-5 py-4">
            <label className="text-sm text-gray-500 w-24 shrink-0">공급처명 *</label>
            <input
              type="text" required value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="예: 서울청과"
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
        </div>
        <div className="flex justify-center gap-3 px-5 py-4 bg-gray-50">
          <button type="submit" disabled={loading}
            className="rounded-lg bg-brand-600 text-white px-8 py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
            {loading ? '등록 중...' : '공급처 등록'}
          </button>
          <a href="/admin/suppliers"
            className="rounded-lg border border-gray-300 text-gray-700 px-8 py-2.5 text-sm font-semibold hover:bg-gray-50">
            취소
          </a>
        </div>
      </form>
    </div>
  )
}
