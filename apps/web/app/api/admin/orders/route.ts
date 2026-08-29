export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-member-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncSpecFromOrders, buildPriceMapByProduct } from '@/lib/specs/sync'
import { refreshDispatchJobItems } from '@/lib/dispatch/current-items'
import { normalizeUnit } from '@/lib/units'

interface RawItem {
  product_id?: string
  supplier_product_id?: string | null
  qty?: number | string | null
  unit?: string | null
  unit_price_snapshot?: number | string | null
  memo?: string
}

interface CleanItem {
  product_id: string
  supplier_product_id: string | null
  qty: number
  unit: string
  unit_price_snapshot: number
  memo: string
}

export async function POST(req: NextRequest) {
  // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  const { user } = session

  const body = await req.json()
  const { restaurantId, businessDate, batchId: existingBatchId, orderId: existingOrderId, items: rawItems, isSubmit } = body as {
    restaurantId: string
    businessDate: string
    batchId?: string | null
    orderId?: string | null
    items?: RawItem[]
    isSubmit?: boolean
  }

  if (!restaurantId || !businessDate) {
    return NextResponse.json({ error: '필수 정보 누락' }, { status: 400 })
  }

  const items: CleanItem[] = (rawItems ?? [])
    .filter(i => !!i.product_id && Number.isFinite(Number(i.qty)) && Number(i.qty) > 0)
    .map(i => ({
      product_id: i.product_id!,
      supplier_product_id: i.supplier_product_id ?? null,
      qty: Number(i.qty),
      unit: (i.unit && String(i.unit).trim()) || 'ea',
      unit_price_snapshot: Number.isFinite(Number(i.unit_price_snapshot)) ? Number(i.unit_price_snapshot) : 0,
      memo: i.memo ?? '',
    }))

  const adminDb = createAdminClient()
  const productIds = [...new Set(items.map(i => i.product_id))]

  if (productIds.length > 0) {
    const { data: masterRows } = await adminDb
      .from('products')
      .select('id, default_unit, allowed_units')
      .in('id', productIds)
    const masterMap = new Map<string, { default_unit: string; allowed_units: string[] | null }>()
    for (const m of masterRows ?? []) {
      masterMap.set(m.id, { default_unit: m.default_unit, allowed_units: m.allowed_units })
    }
    for (const item of items) {
      const master = masterMap.get(item.product_id)
      if (!master) continue
      const allowed = master.allowed_units && master.allowed_units.length > 0
        ? master.allowed_units
        : [master.default_unit]
      if (!allowed.includes(item.unit)) {
        item.unit = master.default_unit
      }
    }
  }

  if (productIds.length > 0) {
    const { data: spRows } = await adminDb
      .from('supplier_products')
      .select('id, product_id, updated_at')
      .in('product_id', productIds)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })

    const productToSp: Record<string, string> = {}
    for (const sp of spRows ?? []) {
      if (!productToSp[sp.product_id]) productToSp[sp.product_id] = sp.id
    }

    // 단가는 명세서와 **같은 규칙**으로 구한다.
    //
    // 예전에는 여기서 price_snapshots 만 뒤져, 업체별 고정단가(org_product_prices)를
    // 통째로 무시했다. 용산점 두절콩나물이 14,000 으로 등록돼 있는데 발주는 13,500 으로
    // 잡혀, 사장님이 명세서를 매번 손으로 고치고 계셨다 (2026-08-29).
    const { data: rest } = await adminDb
      .from('restaurants').select('organization_id').eq('id', restaurantId).maybeSingle()
    const { priceMap } = await buildPriceMapByProduct(
      adminDb, productIds, businessDate,
      (rest as { organization_id: string } | null)?.organization_id ?? null,
      Object.fromEntries(items.filter(i => i.unit).map(i => [i.product_id, normalizeUnit(i.unit) as string])),
    )

    for (const item of items) {
      if (!item.supplier_product_id) {
        const spId = productToSp[item.product_id]
        if (spId) item.supplier_product_id = spId
      }
      if (item.unit_price_snapshot <= 0) {
        const price = priceMap[item.product_id]
        if (price !== undefined) item.unit_price_snapshot = Number(price)
      }
    }
  }

  try {
    let batchId = existingBatchId
    let orderId = existingOrderId

    if (!batchId) {
      const { data: existing } = await adminDb
        .from('order_batches').select('id')
        .eq('restaurant_id', restaurantId).eq('business_date', businessDate).maybeSingle()

      if (existing) {
        batchId = existing.id
      } else {
        const { data: newBatch, error: batchError } = await adminDb
          .from('order_batches')
          .insert({ restaurant_id: restaurantId, business_date: businessDate, status: 'open' })
          .select('id').single()
        if (batchError) return NextResponse.json({ error: `배치 생성 실패: ${batchError.message}` }, { status: 500 })
        batchId = newBatch.id
      }
    }

    if (!orderId) {
      const { data: existingOrder } = await adminDb
        .from('orders').select('id').eq('batch_id', batchId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (existingOrder) {
        orderId = existingOrder.id
      } else {
        const timestamp = Date.now().toString(36).toUpperCase()
        const { data: order, error: orderError } = await adminDb
          .from('orders')
          .insert({ batch_id: batchId, order_no: `FL-ADMIN-${timestamp}`, source_type: 'web', version: 1 })
          .select('id').single()
        if (orderError) return NextResponse.json({ error: `주문 생성 실패: ${orderError.message}` }, { status: 500 })
        orderId = order.id
      }
    }

    const { data: existingItems } = await adminDb
      .from('order_items').select('id').eq('order_id', orderId)
    const existingItemIds = (existingItems ?? []).map((i: { id: string }) => i.id)
    if (existingItemIds.length > 0) {
      await adminDb.from('dispatch_job_items').delete().in('order_item_id', existingItemIds)
      await adminDb.from('daily_spec_lines').update({ order_item_id: null }).in('order_item_id', existingItemIds)
    }

    await adminDb.from('order_items').delete().eq('order_id', orderId)

    if (items.length > 0) {
      const { error: insertError } = await adminDb
        .from('order_items')
        .insert(items.map(item => ({ ...item, order_id: orderId })))
      if (insertError) return NextResponse.json({ error: `아이템 저장 실패: ${insertError.message}` }, { status: 500 })
    }

    if (isSubmit) {
      const { error: batchError } = await adminDb
        .from('order_batches')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', batchId)
      if (batchError) return NextResponse.json({ error: `제출 실패: ${batchError.message}` }, { status: 500 })

      // 명세서가 이미 있어도 반드시 맞춘다.
      // 예전에는 있으면 건너뛰어서, 나중에 추가한 품목이 명세서에 안 들어갔다.
      try {
        await syncSpecFromOrders(adminDb, {
          restaurantId, businessDate, orderIds: orderId ? [orderId] : [],
        })
      } catch (e) {
        return NextResponse.json(
          { error: `명세서 갱신 실패: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
      }

      // 발주가 바뀌면 공급처별 발주 내역(dispatch_job_items)도 따라가야 한다.
      // 이게 없으면 02:30 자동발주 뒤에 추가한 품목이 «당일 발주 집계» 에만 뜨고
      // «공급처별 발주 내역» 에는 빠진다. 이미 있는 job 만 채우고 문자는 보내지 않는다.
      try {
        await refreshDispatchJobItems(adminDb, businessDate)
      } catch (e) {
        console.error('[orders] 공급처별 발주 내역 갱신 실패', businessDate, e)
      }
    }

    return NextResponse.json({ orderId, batchId })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '알 수 없는 오류' }, { status: 500 })
  }
}
