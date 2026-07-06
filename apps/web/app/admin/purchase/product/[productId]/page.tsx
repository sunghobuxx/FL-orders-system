export const runtime = 'edge'

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getSessionUser } from '@/lib/supabase/server'

import AdminSettlementShell from '../../../settlement/AdminSettlementShell'

interface Props {
  params: Promise<{ productId: string }>
}

export default async function PurchaseProductPage({ params }: Props) {
  const { productId } = await params
  const { supabase: db, user } = await getSessionUser()

  const { data: product } = await db
    .from('products').select('id, standard_name, default_unit').eq('id', productId).single()

  if (!product) notFound()

  // 이 품목의 매입 내역 (purchase_items)
  const { data: items } = await db
    .from('purchase_items')
    .select('id, business_date, qty, unit, unit_price, amount')
    .eq('product_id', productId)
    .order('business_date', { ascending: false })
    .limit(60)

  const fmt = (n: number) => `${n.toLocaleString()}원`
  const totalAmount = (items ?? []).reduce((s, i) => s + Number(i.amount), 0)

  return (
    <AdminSettlementShell>
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-3">
          <Link href="/admin/purchase" className="text-sm text-gray-400 hover:text-gray-600">← 목록</Link>
          <span className="text-sm font-bold text-gray-800 bg-gray-100 px-4 py-1.5 rounded-lg">
            품목: {product.standard_name}
          </span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
            <span>날짜</span>
            <span className="text-center">수량</span>
            <span className="text-center">단가</span>
            <span className="text-right">총금액</span>
          </div>
          {(items ?? []).length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">매입 내역이 없습니다</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {(items ?? []).map(item => (
                <div key={item.id} className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 items-center px-5 py-3">
                  <span className="text-sm text-gray-800 bg-gray-100 px-3 py-1.5 rounded">
                    {item.business_date}
                  </span>
                  <span className="text-sm text-center text-gray-700 bg-gray-100 px-2 py-1.5 rounded">
                    {Number(item.qty) % 1 === 0 ? Number(item.qty) : Number(item.qty).toFixed(1)} {item.unit}
                  </span>
                  <span className="text-sm text-center text-gray-700 bg-gray-100 px-2 py-1.5 rounded">
                    {Number(item.unit_price).toLocaleString()}
                  </span>
                  <span className="text-sm text-right font-medium text-gray-800 bg-gray-100 px-2 py-1.5 rounded">
                    {fmt(Number(item.amount))}
                  </span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 items-center px-5 py-3 bg-gray-50">
                <span className="text-sm font-semibold text-gray-700">합계</span>
                <span className="col-span-2" />
                <span className="text-sm text-right font-bold text-gray-900 bg-gray-100 px-2 py-1.5 rounded">
                  {fmt(totalAmount)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminSettlementShell>
  )
}
