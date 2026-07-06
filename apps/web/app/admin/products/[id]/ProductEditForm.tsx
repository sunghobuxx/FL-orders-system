'use client'

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

interface Product {
  id: string
  standard_name: string
  category: string | null
  default_unit: string
  sku: string | null
  taxable_flag: boolean | null
  is_kg_based: boolean | null
  is_fixed_price: boolean | null
  status: string | null
  allowed_units: string[] | null
}

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <p className="block text-sm font-medium text-gray-700 mb-1.5">
      {text}{required && <span className="text-red-500 ml-0.5">*</span>}
    </p>
  )
}

export default function ProductEditForm({ product }: { product: Product }) {
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
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          standard_name: d.get('standard_name'),
          category: d.get('category'),
          default_unit: d.get('default_unit'),
          sku: d.get('sku') || null,
          allowed_units,
          taxable_flag: d.get('taxable_flag') === 'true',
          is_kg_based: d.get('is_kg_based') === 'true',
          is_fixed_price: d.get('is_fixed_price') !== 'false',
          status: d.get('status'),
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setError(data.error ?? '수정 실패'); return }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const allowedSet = new Set(product.allowed_units ?? [])

  return (
    <form onSubmit={handleSubmit} className="space-y-5 bg-white rounded-xl border border-gray-200 p-6">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div>
        <FieldLabel text="SKU (품목 코드)" />
        <input
          name="sku" defaultValue={product.sku ?? ''}
          placeholder="예: VEG-030"
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div>
        <FieldLabel text="품목명" required />
        <input
          name="standard_name" required defaultValue={product.standard_name}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div>
        <FieldLabel text="카테고리" required />
        <select
          name="category" required defaultValue={product.category ?? ''}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">선택하세요</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      <div>
        <FieldLabel text="기본 단위" required />
        <select
          name="default_unit" required defaultValue={product.default_unit}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      <div>
        <FieldLabel text="허용 단위 (복수 선택 가능)" />
        <div className="flex flex-wrap gap-2">
          {UNITS.map(u => (
            <label key={u} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" name="allowed_units" value={u} defaultChecked={allowedSet.has(u)} className="rounded" />
              {u}
            </label>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel text="상태" />
        <select
          name="status" defaultValue={product.status ?? 'active'}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="active">활성</option>
          <option value="inactive">비활성</option>
        </select>
      </div>

      <div className="flex gap-6">
        <div>
          <FieldLabel text="kg당 단가 기준" />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" name="is_kg_based" value="true" defaultChecked={product.is_kg_based ?? false} className="rounded" />
            kg당 단가 기준
          </label>
        </div>
        <div>
          <FieldLabel text="고정 단가" />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" name="is_fixed_price" value="true" defaultChecked={product.is_fixed_price ?? true} className="rounded" />
            고정 단가 (변동 없음)
          </label>
        </div>
        <div>
          <FieldLabel text="부가세" />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" name="taxable_flag" value="true" defaultChecked={product.taxable_flag ?? true} className="rounded" />
            부가세 10% 적용
          </label>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <a href="/admin/products"
          className="flex-1 text-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          목록으로
        </a>
        <button type="submit" disabled={loading}
          className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {loading ? '저장 중...' : '저장'}
        </button>
      </div>
    </form>
  )
}
