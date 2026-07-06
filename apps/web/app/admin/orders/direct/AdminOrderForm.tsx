'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Product {
  id: string
  standard_name: string
  default_unit: string
  allowed_units: string[]
  is_kg_based: boolean
  image_path: string | null
  category: string
}

interface PriceData {
  id: string
  product_id: string
  price_snapshots: Array<{ sale_price: number; unit: string; effective_from: string }>
}

interface ExistingItem {
  id: string
  product_id: string
  qty: number
  unit: string
  unit_price_snapshot: number
  memo: string | null
  products: { standard_name: string; is_kg_based: boolean; image_path: string | null }
}

interface Props {
  selectedRestaurantId: string
  businessDate: string
  batchId: string | null
  orderId: string | null
  products: Product[]
  prices: PriceData[]
  existingItems: ExistingItem[]
}

const CATEGORY_LABEL: Record<string, string> = {
  vegetable: '채소', fruit: '과일', meat: '육류', seafood: '수산',
  grain: '곡류', dairy: '유제품', seasoning: '양념', etc: '기타',
}
const CATEGORY_EMOJI: Record<string, string> = {
  vegetable: '🥬', fruit: '🍎', meat: '🥩', seafood: '🐟',
  grain: '🌾', dairy: '🥛', seasoning: '🧄', etc: '📦',
}
const CATEGORY_ORDER = ['vegetable', 'fruit', 'grain', 'meat', 'seafood', 'dairy', 'seasoning', 'etc']

export default function AdminOrderForm({
  selectedRestaurantId, businessDate,
  batchId, orderId, products, prices, existingItems,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [currentBatchId] = useState(batchId)
  const [currentOrderId, setCurrentOrderId] = useState(orderId)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [qtys, setQtys] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const item of existingItems) {
      init[item.product_id] = String(item.qty)
    }
    return init
  })

  const [units, setUnits] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const item of existingItems) {
      init[item.product_id] = item.unit
    }
    return init
  })

  const categories = CATEGORY_ORDER.filter(cat => products.some(p => p.category === cat))
  const [activeCategory, setActiveCategory] = useState(categories[0] ?? 'vegetable')

  const productsByCategory = categories.reduce<Record<string, Product[]>>((acc, cat) => {
    acc[cat] = products.filter(p => p.category === cat)
    return acc
  }, {})

  const orderedCountByCategory = (cat: string) =>
    (productsByCategory[cat] ?? []).filter(p => parseFloat(qtys[p.id] ?? '0') > 0).length

  const orderedCount = products.filter(p => parseFloat(qtys[p.id] ?? '0') > 0).length

  const getPriceForProduct = (productId: string) => {
    const sp = prices.find(p => p.product_id === productId)
    if (!sp || !sp.price_snapshots.length) return { price: 0, supplierProductId: null }
    const valid = sp.price_snapshots
      .filter(s => s.effective_from <= businessDate)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
    const latest = valid[0]
    return { price: latest?.sale_price ?? 0, supplierProductId: sp.id }
  }

  const handleQtyChange = (productId: string, val: string) => {
    setQtys(prev => ({ ...prev, [productId]: val }))
  }

  const handleSubmit = (isSubmit: boolean) => {
    startTransition(async () => {
      const orderedItems = []
      for (const p of products) {
        const qty = parseFloat(qtys[p.id] ?? '0')
        if (!Number.isFinite(qty) || qty <= 0) continue
        const { price, supplierProductId } = getPriceForProduct(p.id)
        orderedItems.push({
          product_id: p.id,
          supplier_product_id: supplierProductId,
          qty,
          unit: units[p.id] ?? p.default_unit ?? 'ea',
          unit_price_snapshot: Number.isFinite(price) ? price : 0,
          memo: '',
        })
      }
      try {
        const res = await fetch('/api/admin/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurantId: selectedRestaurantId,
            businessDate,
            batchId: currentBatchId,
            orderId: currentOrderId,
            items: orderedItems,
            isSubmit,
          }),
        })
        const result = await res.json()
        if (result?.orderId) {
          setCurrentOrderId(result.orderId)
          setErrorMessage(null)
          if (isSubmit) {
            router.push('/admin/orders')
          } else {
            setSuccessMessage('임시 저장되었습니다.')
          }
          return
        }
        setErrorMessage(result?.error ?? '발주 저장에 실패했습니다.')
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
      }
    })
  }

  const currentProducts = productsByCategory[activeCategory] ?? []

  return (
    <div className="space-y-3">
      {existingItems.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold mb-0.5">⚠️ 기존 발주가 있습니다</p>
          <p>발주 등록 시 기존 품목 {existingItems.length}개가 모두 교체됩니다. 수량을 확인 후 제출하세요.</p>
        </div>
      )}
      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          {successMessage}
        </div>
      )}

      {/* 카테고리 탭 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex overflow-x-auto scrollbar-hide border-b border-gray-200">
          {categories.map(cat => {
            const count = orderedCountByCategory(cat)
            const isActive = activeCategory === cat
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`flex-shrink-0 flex flex-col items-center gap-1 px-4 py-3 border-b-2 transition-colors relative ${
                  isActive
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-transparent text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span className="text-xl">{CATEGORY_EMOJI[cat]}</span>
                <span className="text-xs font-semibold whitespace-nowrap">{CATEGORY_LABEL[cat] ?? cat}</span>
                {count > 0 && (
                  <span className="absolute top-1.5 right-1 bg-brand-600 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="divide-y divide-gray-100">
          {currentProducts.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">이 카테고리에 품목이 없습니다</div>
          ) : (
            currentProducts.map(product => {
              const qty = qtys[product.id] ?? ''
              const isOrdered = parseFloat(qty) > 0
              const allUnits = [...new Set([product.default_unit, ...(product.allowed_units ?? [])])].filter(Boolean)
              const selectedUnit = units[product.id] ?? product.default_unit
              const isKgLike = ['kg', 'g'].includes(selectedUnit)
              const step = isKgLike ? 0.1 : 1

              return (
                <div
                  key={product.id}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${isOrdered ? 'bg-brand-50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium truncate block ${isOrdered ? 'text-brand-800' : 'text-gray-800'}`}>
                      {product.standard_name}
                    </span>
                    {allUnits.length > 1 ? (
                      <select
                        value={selectedUnit}
                        onChange={e => setUnits(prev => ({ ...prev, [product.id]: e.target.value }))}
                        className="text-xs text-gray-500 border border-gray-200 rounded px-1 py-0.5 mt-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
                      >
                        {allUnits.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-400">{product.default_unit}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const cur = parseFloat(qty || '0')
                        const next = Math.max(0, cur - step)
                        handleQtyChange(product.id, next === 0 ? '' : String(Math.round(next * 10) / 10))
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 active:bg-gray-200 text-lg font-bold"
                    >−</button>
                    <input
                      type="number"
                      value={qty}
                      onChange={e => handleQtyChange(product.id, e.target.value)}
                      min="0"
                      step={step}
                      placeholder="0"
                      className={`w-14 rounded-lg border text-sm text-center py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ${
                        isOrdered
                          ? 'border-brand-400 bg-white font-bold text-brand-700'
                          : 'border-gray-200 bg-gray-50 text-gray-700'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const cur = parseFloat(qty || '0')
                        handleQtyChange(product.id, String(Math.round((cur + step) * 10) / 10))
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 active:bg-gray-200 text-lg font-bold"
                    >+</button>
                  </div>

                  <div className="w-7 shrink-0 flex justify-center">
                    {isOrdered
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

      {/* 요약 + 버튼 */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
        <div>
          {orderedCount > 0 ? (
            <div>
              <p className="text-sm font-semibold text-gray-800">발주 예정 {orderedCount}개 품목</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {categories
                  .filter(c => orderedCountByCategory(c) > 0)
                  .map(c => `${CATEGORY_LABEL[c]} ${orderedCountByCategory(c)}개`)
                  .join(' · ')}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">수량을 입력하세요</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={isPending || orderedCount === 0}
            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            임시저장
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={isPending || orderedCount === 0}
            className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? '처리 중...' : '발주 등록'}
          </button>
        </div>
      </div>
    </div>
  )
}
