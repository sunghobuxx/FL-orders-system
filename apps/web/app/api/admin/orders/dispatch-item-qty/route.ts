export const runtime = 'edge'

import { type NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

/**
 * 발주 문자에 나갈 수량만 바꾼다.
 *
 * order_items 를 고치면 명세서·정산까지 따라 바뀐다. 여기서 바꾸는 건
 * dispatch_job_items 뿐이라 문자에만 반영되고 청구 금액은 그대로다.
 *
 * qty_overridden 을 세워 두면 발송 직전 syncDispatchJobItems 가
 * 이 줄의 수량을 발주 수량으로 되돌리지 않는다.
 * qty 를 null 로 보내면 수정을 취소하고 발주 수량으로 돌아간다.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { itemId, qty } = await req.json() as { itemId?: string; qty?: number | null }

    if (!itemId) {
      return NextResponse.json({ error: '필수 값 누락 (itemId)' }, { status: 400 })
    }
    if (qty !== null && (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 0)) {
      return NextResponse.json({ error: '수량은 0 이상의 숫자여야 합니다' }, { status: 400 })
    }

    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

    const db = createAdminClient()

    const { data: row, error: readError } = await db
      .from('dispatch_job_items')
      .select('id, qty, order_items(qty)')
      .eq('id', itemId)
      .maybeSingle()

    if (readError) throw readError
    if (!row) return NextResponse.json({ error: '발주 품목을 찾을 수 없습니다' }, { status: 404 })

    // 수정 취소면 발주 수량으로 되돌린다.
    const orderQty = Number((row.order_items as unknown as { qty: number } | null)?.qty ?? row.qty)
    const next = qty === null
      ? { qty: orderQty, qty_overridden: false }
      : { qty, qty_overridden: true }

    const { error } = await db.from('dispatch_job_items').update(next).eq('id', itemId)
    if (error) throw error

    return NextResponse.json({ success: true, qty: next.qty, overridden: next.qty_overridden })
  } catch (e) {
    console.error('[PATCH /api/admin/orders/dispatch-item-qty]', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
