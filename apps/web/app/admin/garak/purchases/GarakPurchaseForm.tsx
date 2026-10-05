'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Product { id: string; standard_name: string; default_unit: string | null }
interface Row { id: string; product_id: string; unit: string; qty: number; unit_price: number; products: { standard_name: string } | null }

export default function GarakPurchaseForm({ date, products, rows }: { date: string; products: Product[]; rows: Row[] }) {
  const router = useRouter()
  const [productId, setProductId] = useState('')
  const [unit, setUnit] = useState('')
  const [qty, setQty] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  function pickProduct(id: string) {
    setProductId(id)
    const p = products.find(x => x.id === id)
    setUnit(p?.default_unit ?? '')
  }

  async function save() {
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/admin/garak-purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessDate: date,
          productId,
          unit,
          qty: Number(qty),
          unitPrice: Number(unitPrice),
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? '저장 실패')
      setQty('')
      setUnitPrice('')
      router.refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('이 매입 기록을 삭제할까요?')) return
    const res = await fetch(`/api/admin/garak-purchases?id=${id}`, { method: 'DELETE' })
    if (!res.ok) { setMessage('삭제 실패'); return }
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={e => { e.preventDefault(); save() }}
        className="bg-white rounded-xl border border-gray-200 p-5 space-y-3"
      >
        <div className="text-sm text-gray-500">날짜: <span className="font-semibold text-gray-800">{date}</span></div>
        <select
          value={productId}
          onChange={e => pickProduct(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          required
        >
          <option value="">품목 선택</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.standard_name}</option>)}
        </select>
        <div className="grid grid-cols-3 gap-2">
          <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="단위" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <input value={qty} onChange={e => setQty(e.target.value)} type="number" min="0" step="0.1" placeholder="수량" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <input value={unitPrice} onChange={e => setUnitPrice(e.target.value)} type="number" min="0" step="100" placeholder="매입가" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        {message && <p className="text-xs text-red-500">{message}</p>}
        <button type="submit" disabled={busy || !productId} className="w-full py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
          {busy ? '저장 중...' : '저장'}
        </button>
      </form>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">이 날짜에 기록된 가락 매입이 없습니다</p>
        ) : rows.map(r => (
          <div key={r.id} className="flex items-center justify-between px-5 py-3 border-b border-gray-100 last:border-0">
            <div className="text-sm text-gray-800">{r.products?.standard_name ?? '품목'}</div>
            <div className="flex items-center gap-4 text-sm text-gray-600 tabular-nums">
              <span>{Number(r.qty)} {r.unit}</span>
              <span>{Number(r.unit_price).toLocaleString()}원</span>
              <button type="button" onClick={() => remove(r.id)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
