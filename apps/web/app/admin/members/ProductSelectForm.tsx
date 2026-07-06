'use client'

import { useState } from 'react'

interface Product {
  id: string
  standard_name: string
  default_unit: string
  category: string
}

interface Props {
  entityId: string
  isSupplier: boolean
  allProducts: Product[]
  linkedIds: string[]
}

export default function ProductSelectForm({ entityId, isSupplier, allProducts, linkedIds }: Props) {
  const [linked, setLinked] = useState<Set<string>>(new Set(linkedIds))
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  async function toggle(productId: string) {
    const isLinked = linked.has(productId)
    setLoading(prev => ({ ...prev, [productId]: true }))
    try {
      const res = await fetch('/api/admin/products/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, productId, isSupplier, link: !isLinked }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? '변경 실패')
      }
      setLinked(prev => {
        const next = new Set(prev)
        if (isLinked) next.delete(productId)
        else next.add(productId)
        return next
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : '변경 실패')
    } finally {
      setLoading(prev => ({ ...prev, [productId]: false }))
    }
  }

  const grouped = allProducts.reduce<Record<string, Product[]>>((acc, p) => {
    const cat = p.category ?? '기타'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {})

  return (
    <div className="px-5 py-4 space-y-4">
      {Object.entries(grouped).map(([cat, products]) => (
        <div key={cat}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{cat}</p>
          <div className="flex flex-wrap gap-2">
            {products.map(p => {
              const isLinked = linked.has(p.id)
              const isLoading = loading[p.id]
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  disabled={isLoading}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors disabled:opacity-50 ${
                    isLinked
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
                  }`}
                >
                  {isLoading ? '...' : `${p.standard_name} (${p.default_unit})`}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {allProducts.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">등록된 품목이 없습니다</p>
      )}
    </div>
  )
}
