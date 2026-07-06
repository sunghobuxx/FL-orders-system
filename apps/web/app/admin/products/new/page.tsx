'use client'

export const runtime = 'edge'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const UNITS = ['kg', 'g', '박스', '팩', '단', '통', '판', '포', '망', 'ea', 'bag', 'pack', 'bottle', 'box']
const CATEGORIES = [
  { value: 'vegetable', label: '채소' },
  { value: 'fruit', label: '과일' },
  { value: 'meat', label: '육류' },
  { value: 'seafood', label: '수산' },
  { value: 'grain', label: '곡류' },
  { value: 'dairy', label: '유제품' },
  { value: 'seasoning', label: '양념/조미료' },
  { value: 'etc', label: '기타' },
]

function FieldWrapper({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

export default function AdminProductNewPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const d = new FormData(e.currentTarget)
    const allowed_units = d.getAll('allowed_units') as string[]
    try {
      const res = await fetch('/api/admin/products/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: d.get('sku') || null,
          standard_name: d.get('standard_name'),
          category: d.get('category'),
          default_unit: d.get('default_unit'),
          allowed_units,
          taxable_flag: d.get('taxable_flag') === 'true',
          is_kg_based: d.get('is_kg_based') === 'true',
          is_fixed_price: d.get('is_fixed_price') !== 'false',
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setError(data.error ?? '등록 실패'); return }
      router.push('/admin/products')
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">품목 등록</h1>
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      <form onSubmit={handleSubmit} className="space-y-5 bg-white rounded-xl border border-gray-200 p-6">
        <FieldWrapper label="SKU (품목 코드)">
          <input
            name="sku" placeholder="예: VEG-030 (미입력 시 자동)"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </FieldWrapper>

        <FieldWrapper label="품목명" required>
          <input
            name="standard_name" required placeholder="예: 대파"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </FieldWrapper>

        <FieldWrapper label="카테고리" required>
          <select
            name="category" required
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">선택하세요</option>
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </FieldWrapper>

        <FieldWrapper label="기본 단위" required>
          <select
            name="default_unit" required
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">선택하세요</option>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </FieldWrapper>

        <FieldWrapper label="허용 단위 (복수 선택 가능)">
          <div className="flex flex-wrap gap-2">
            {UNITS.map(u => (
              <label key={u} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" name="allowed_units" value={u} className="rounded" />
                {u}
              </label>
            ))}
          </div>
        </FieldWrapper>

        <div className="flex gap-6">
          <FieldWrapper label="kg당 단가 기준">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" name="is_kg_based" value="true" className="rounded" />
              kg당 단가 기준
            </label>
          </FieldWrapper>
          <FieldWrapper label="고정 단가">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" name="is_fixed_price" value="true" defaultChecked className="rounded" />
              고정 단가 (변동 없음)
            </label>
          </FieldWrapper>
          <FieldWrapper label="부가세">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" name="taxable_flag" value="true" defaultChecked className="rounded" />
              부가세 10% 적용
            </label>
          </FieldWrapper>
        </div>

        <div className="flex gap-3 pt-2">
          <a href="/admin/products"
            className="flex-1 text-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            취소
          </a>
          <button type="submit" disabled={loading}
            className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {loading ? '등록 중...' : '등록'}
          </button>
        </div>
      </form>
    </div>
  )
}
