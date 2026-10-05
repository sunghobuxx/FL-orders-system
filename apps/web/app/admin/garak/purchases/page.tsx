export const runtime = 'edge'

import { createAdminClient } from '@/lib/supabase/admin'
import { getKstToday } from '@/lib/date-kst'
import GarakPurchaseForm from './GarakPurchaseForm'

interface Props {
  searchParams: Promise<{ date?: string }>
}

/** 가락 매입 기록. 가락에서 산 날짜·품목·수량·매입가를 적는다. (명세서 단가에는 아직 반영 안 함) */
export default async function GarakPurchasesPage({ searchParams }: Props) {
  const { date: dateParam } = await searchParams
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : getKstToday()
  const db = createAdminClient()

  const [{ data: products }, { data: rows }] = await Promise.all([
    db.from('products').select('id, standard_name, default_unit').eq('status', 'active').order('standard_name'),
    db.from('garak_purchases')
      .select('id, product_id, unit, qty, unit_price, products(standard_name)')
      .eq('business_date', date)
      .order('created_at'),
  ])

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div>
        <h1 className="text-lg font-bold text-gray-900">가락 매입 기록</h1>
        <p className="text-sm text-gray-400 mt-0.5">가락에서 산 품목과 수량·매입가를 날짜별로 적어 둡니다.</p>
      </div>
      <GarakPurchaseForm
        date={date}
        products={(products ?? []) as { id: string; standard_name: string; default_unit: string | null }[]}
        rows={(rows ?? []) as unknown as { id: string; product_id: string; unit: string; qty: number; unit_price: number; products: { standard_name: string } | null }[]}
      />
    </div>
  )
}
