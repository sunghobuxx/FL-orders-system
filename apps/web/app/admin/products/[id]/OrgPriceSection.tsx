'use client'

import { useRouter } from 'next/navigation'
import { useTransition, useState } from 'react'

import { deleteOrgProductPrice, upsertOrgProductPrice } from '../actions'

type OrgPrice = { organization_id: string; orgName: string; unit_price: number }
type OrgOption = { id: string; name: string }

interface Props {
  productId: string
  orgPrices: OrgPrice[]
  allOrgs: OrgOption[]
}

export default function OrgPriceSection({ productId, orgPrices, allOrgs }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [inputPrice, setInputPrice] = useState('')
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState('')

  const existingOrgIds = new Set(orgPrices.map(p => p.organization_id))
  const availableOrgs = allOrgs.filter(o => !existingOrgIds.has(o.id))

  function handleAdd() {
    const price = Number(inputPrice)
    if (!selectedOrgId || !price || price <= 0) return
    startTransition(async () => {
      const result = await upsertOrgProductPrice(productId, selectedOrgId, price)
      if (!result.success) { alert(result.error ?? '저장 실패'); return }
      setSelectedOrgId('')
      setInputPrice('')
      router.refresh()
    })
  }

  function handleEdit(orgId: string) {
    const price = Number(editPrice)
    if (!price || price <= 0) return
    startTransition(async () => {
      const result = await upsertOrgProductPrice(productId, orgId, price)
      if (!result.success) { alert(result.error ?? '수정 실패'); return }
      setEditingOrgId(null)
      setEditPrice('')
      router.refresh()
    })
  }

  function handleDelete(orgId: string, orgName: string) {
    if (!confirm(`${orgName}의 고정단가를 삭제하시겠습니까?`)) return
    startTransition(async () => {
      const result = await deleteOrgProductPrice(productId, orgId)
      if (!result.success) { alert(result.error ?? '삭제 실패'); return }
      router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700">업체별 고정단가</h2>
        <p className="text-xs text-gray-400 mt-0.5">설정된 업체는 품목 마스터 단가 무관하게 이 단가로 명세서가 생성됩니다</p>
      </div>

      {orgPrices.length > 0 ? (
        <div className="divide-y divide-gray-100">
          {orgPrices.map(op => (
            <div key={op.organization_id} className="px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-gray-800 w-32 shrink-0">{op.orgName}</span>
              {editingOrgId === op.organization_id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="number"
                    value={editPrice}
                    onChange={e => setEditPrice(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm w-28 text-right"
                    placeholder="단가"
                    min={1}
                  />
                  <span className="text-sm text-gray-500">원</span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleEdit(op.organization_id)}
                    className="text-xs bg-brand-600 text-white rounded px-3 py-1 disabled:opacity-50"
                  >저장</button>
                  <button
                    type="button"
                    onClick={() => setEditingOrgId(null)}
                    className="text-xs text-gray-500 hover:underline"
                  >취소</button>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-1 justify-between">
                  <span className="text-sm font-semibold text-green-700">
                    {Number(op.unit_price).toLocaleString()}원
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditingOrgId(op.organization_id); setEditPrice(String(op.unit_price)) }}
                      className="text-xs text-brand-600 hover:underline"
                    >수정</button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleDelete(op.organization_id, op.orgName)}
                      className="text-xs text-red-500 hover:underline disabled:opacity-50"
                    >삭제</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-gray-400">설정된 업체별 단가가 없습니다.</p>
      )}

      {availableOrgs.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2">
          <select
            value={selectedOrgId}
            onChange={e => setSelectedOrgId(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm flex-1"
          >
            <option value="">업체 선택</option>
            {availableOrgs.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <input
            type="number"
            value={inputPrice}
            onChange={e => setInputPrice(e.target.value)}
            placeholder="단가"
            min={1}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm w-24 text-right"
          />
          <span className="text-sm text-gray-500 shrink-0">원</span>
          <button
            type="button"
            disabled={isPending || !selectedOrgId || !inputPrice}
            onClick={handleAdd}
            className="text-xs bg-brand-600 text-white rounded px-3 py-1.5 disabled:opacity-50 whitespace-nowrap"
          >
            {isPending ? '저장 중...' : '추가'}
          </button>
        </div>
      )}
    </div>
  )
}
