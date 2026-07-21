'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const CATEGORY_LABELS: Record<string, string> = {
  vegetable: '채소', fruit: '과일', meat: '육류', seafood: '수산',
  grain: '곡류', dairy: '유제품', seasoning: '양념', etc: '기타',
}
const CATEGORY_EMOJI: Record<string, string> = {
  vegetable: '🥬', fruit: '🍎', meat: '🥩', seafood: '🐟',
  grain: '🌾', dairy: '🥛', seasoning: '🧄', etc: '📦',
}
const CATEGORY_ORDER = ['vegetable', 'fruit', 'grain', 'meat', 'seafood', 'dairy', 'seasoning', 'etc']

type Product = {
  id: string
  standard_name: string
  default_unit: string
  allowed_units: string[] | null
  is_kg_based: boolean
  image_path: string | null
  category: string
}

type SupplierProduct = {
  id: string
  product_id: string
  price_snapshots: { effective_from: string; sale_price: number }[]
}

type OrderItem = {
  id: string
  product_id: string
  qty: number
  unit: string
  unit_price_snapshot: number
  memo: string | null
  products: { standard_name: string; is_kg_based: boolean; image_path: string | null } | null
}

interface Props {
  restaurantId: string
  businessDate: string
  batchId: string | null
  orderId: string | null
  products: Product[]
  prices: SupplierProduct[]
  existingItems: OrderItem[]
}

export default function OrderForm({ restaurantId, businessDate, batchId, orderId: initialOrderId, products, prices, existingItems }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [currentOrderId, setCurrentOrderId] = useState(initialOrderId)
  const [error, setError] = useState<string | null>(null)

  const [quantities, setQuantities] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const item of existingItems) m[item.product_id] = String(item.qty)
    return m
  })
  const [units, setUnits] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const item of existingItems) m[item.product_id] = item.unit
    return m
  })

  const availableCategories = CATEGORY_ORDER.filter(cat => products.some(p => p.category === cat))
  const [selectedCategory, setSelectedCategory] = useState(availableCategories[0] ?? 'vegetable')

  const byCategory = availableCategories.reduce<Record<string, Product[]>>((acc, cat) => {
    acc[cat] = products.filter(p => p.category === cat)
    return acc
  }, {})

  const countInCategory = (cat: string) =>
    (byCategory[cat] ?? []).filter(p => parseFloat(quantities[p.id] ?? '0') > 0).length

  const totalCount = products.filter(p => parseFloat(quantities[p.id] ?? '0') > 0).length

  function getPrice(productId: string) {
    const sp = prices.find(p => p.product_id === productId)
    if (!sp || !sp.price_snapshots.length) return { price: 0, supplierProductId: null }
    const snap = sp.price_snapshots
      .filter(s => s.effective_from <= businessDate)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]
    return { price: snap?.sale_price ?? 0, supplierProductId: sp.id }
  }

  function updateQty(productId: string, value: string) {
    setQuantities(prev => ({ ...prev, [productId]: value }))
  }

  function stepQty(productId: string, delta: number, step: number) {
    const current = parseFloat(quantities[productId] ?? '0')
    const next = Math.max(0, current + delta * step)
    updateQty(productId, next === 0 ? '' : String(Math.round(next * 10) / 10))
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      try {
        const items = []
        for (const product of products) {
          const qty = parseFloat(quantities[product.id] ?? '0')
          if (!Number.isFinite(qty) || qty <= 0) continue
          const unit = units[product.id] ?? product.default_unit
          const { price, supplierProductId } = getPrice(product.id)
          items.push({
            product_id: product.id,
            supplier_product_id: supplierProductId,
            qty,
            unit,
            unit_price_snapshot: price,
            memo: '',
          })
        }
        if (items.length === 0) {
          setError('수량을 입력하세요')
          return
        }
        const res = await fetch('/api/member/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurantId,
            businessDate,
            batchId,
            orderId: currentOrderId,
            items,
            isSubmit: true,
          }),
        })
        const data = await res.json() as { error?: string; orderId?: string }
        if (!res.ok || data.error) throw new Error(data.error ?? '발주 저장에 실패했습니다.')
        if (data.orderId) setCurrentOrderId(data.orderId)
        router.push(`/member/order-confirm?date=${businessDate}`)
      } catch (e) {
        setError(e instanceof Error ? e.message : '발주 저장에 실패했습니다.')
      }
    })
  }

  const categoryProducts = byCategory[selectedCategory] ?? []

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* 카테고리 탭 */}
        <div className="flex overflow-x-auto scrollbar-hide border-b border-gray-200">
          {availableCategories.map(cat => {
            const count = countInCategory(cat)
            const active = cat === selectedCategory
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`flex-shrink-0 flex flex-col items-center gap-1 px-4 py-3 border-b-2 transition-colors relative ${active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-transparent text-gray-500 hover:bg-gray-50'}`}
              >
                <span className="text-xl">{CATEGORY_EMOJI[cat]}</span>
                <span className="text-xs font-semibold whitespace-nowrap">{CATEGORY_LABELS[cat] ?? cat}</span>
                {count > 0 && (
                  <span className="absolute top-1.5 right-1 bg-brand-600 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* 품목 리스트 */}
        <div className="divide-y divide-gray-100">
          {categoryProducts.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">이 카테고리에 품목이 없습니다</div>
          ) : (
            categoryProducts.map(product => {
              const qty = quantities[product.id] ?? ''
              const hasQty = parseFloat(qty) > 0
              const allowedUnits = [...new Set([product.default_unit, ...(product.allowed_units ?? [])])].filter(Boolean)
              const unit = units[product.id] ?? product.default_unit
              const step = ['kg', 'g'].includes(unit) ? 0.1 : 1

              return (
                <div
                  key={product.id}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${hasQty ? 'bg-brand-50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium truncate block ${hasQty ? 'text-brand-800' : 'text-gray-800'}`}>
                      {product.standard_name}
                    </span>
                    {allowedUnits.length > 1 ? (
                      <select
                        value={unit}
                        onChange={e => setUnits(prev => ({ ...prev, [product.id]: e.target.value }))}
                        className="text-xs text-gray-500 border border-gray-200 rounded px-1 py-0.5 mt-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
                      >
                        {allowedUnits.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-400">{product.default_unit}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => stepQty(product.id, -1, step)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 active:bg-gray-200 text-lg font-bold"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={qty}
                      onChange={e => updateQty(product.id, e.target.value)}
                      min="0"
                      step={step}
                      placeholder="0"
                      className={`w-14 rounded-lg border text-sm text-center py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ${hasQty ? 'border-brand-400 bg-white font-bold text-brand-700' : 'border-gray-200 bg-gray-50 text-gray-700'}`}
                    />
                    <button
                      type="button"
                      onClick={() => stepQty(product.id, 1, step)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 active:bg-gray-200 text-lg font-bold"
                    >
                      +
                    </button>
                  </div>
                  <div className="w-7 shrink-0 flex justify-center">
                    {hasQty
                      ? <span className="text-brand-600 text-lg">✓</span>
                      : <span className="text-gray-200 text-lg">○</span>
                    }
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* 요약 + 제출 */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between">
        <div>
          {totalCount > 0 ? (
            <div>
              <p className="text-sm font-semibold text-gray-800">발주 예정 {totalCount}개 품목</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {availableCategories.filter(c => countInCategory(c) > 0).map(c => `${CATEGORY_EMOJI[c]} ${countInCategory(c)}개`).join(' · ')}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">수량을 입력하세요</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || totalCount === 0}
          className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? '처리 중...' : '발주 확인'}
        </button>
      </div>
    </div>
  )
}
