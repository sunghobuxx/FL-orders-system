export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildPriceMapByProduct, syncSpecFromOrders } from '@/lib/specs/sync'
import { toPackQty } from '@/lib/products/pack-size'
import { normalizeUnit } from '@/lib/units'
import { refreshDispatchJobItems } from '@/lib/dispatch/current-items'
import { archiveOrderItems } from '@/lib/orders/archive-items'
import { isStaleOrderSubmit } from '@/lib/orders/stale-submit'

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
  const adminDb = createAdminClient()
  const auth = req.headers.get('Authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : ''

  let userId: string | null = null
  if (token) {
    const { data: userData, error: userError } = await adminDb.auth.getUser(token)
    if (userError || !userData.user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }
    userId = userData.user.id
  } else {
    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    userId = user.id
  }

  const body = await req.json()
  // orderId 를 아예 안 보내는 화면(구버전 앱)과 "없다"고 명시한 화면을 구별한다.
  const declaresOrderState = Object.prototype.hasOwnProperty.call(body ?? {}, 'orderId')
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

  // 04:00 KST 이후 당일(오늘) 발주 차단 — 02:00~04:00 는 "마감 후 발주" 로 허용
  // 04:00 이후 오늘 발주 시도 → 차단 (내일 발주만 가능)
  const nowUtc = new Date()
  const kstMs = nowUtc.getTime() + 9 * 60 * 60 * 1000
  const kstNow = new Date(kstMs)
  const kstToday = kstNow.toISOString().split('T')[0]
  const kstMinutes = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes()

  // 지난 날짜 발주 차단.
  // 발주 화면은 오늘 아니면 내일만 만들어 보내므로(member/order/page.tsx) 지난 날짜는
  // 정상 경로에서 나올 수 없다. 그런데 지난 날짜가 들어오면 그날 배치를 그대로 재사용해
  // order_items 를 전부 지우고 명세서까지 갈아엎는다. 이미 정산·완납이 끝난 날이어도 막지
  // 않았다 (2026-07-28 고강점 6/19 사고: 147,200원어치가 어제 발주 10줄로 교체됨).
  // 과거 날짜를 손봐야 하면 어드민 경로로 해야 한다.
  if (businessDate < kstToday) {
    return NextResponse.json(
      { error: '지난 날짜로는 발주할 수 없습니다.' },
      { status: 400 },
    )
  }

  if (kstMinutes >= 240 && businessDate === kstToday) {
    return NextResponse.json({ error: '발주 마감 시간(04:00)이 지났습니다.' }, { status: 403 })
  }

  // --- 입력 정제: NaN qty, 빈 unit, NULL 등 모두 차단 ---
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

  if (items.length === 0) {
    return NextResponse.json({ error: '발주할 품목을 1개 이상 선택해주세요.' }, { status: 400 })
  }

  // 회원이 속한 업체의 식당인지 검증한다. 이 검증 전에 adminDb로 주문을 수정하면 안 된다.
  const { data: restaurant } = await adminDb
    .from('restaurants')
    .select('id, organization_id')
    .eq('id', restaurantId)
    .maybeSingle()

  if (!restaurant) {
    return NextResponse.json({ error: '식당 정보를 확인할 수 없습니다.' }, { status: 404 })
  }

  const { data: membership } = await adminDb
    .from('memberships')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('organization_id', restaurant.organization_id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: '해당 식당의 발주 권한이 없습니다.' }, { status: 403 })
  }

  const productIds = [...new Set(items.map(i => i.product_id))]
  const serverPricedItems = new Set<CleanItem>()

  // --- 마스터 강제 검증: 클라이언트가 stale 한 product 정보로 보내도
  //     order_items.unit 은 products.default_unit / allowed_units 와 정합 보장 ---
  if (productIds.length > 0) {
    const { data: masterRows } = await adminDb
      .from('products')
      .select('id, standard_name, default_unit, allowed_units, pack_unit, kg_per_pack')
      .in('id', productIds)
    type ProductMaster = {
      standard_name: string
      default_unit: string
      allowed_units: string[] | null
      pack_unit: string | null
      kg_per_pack: number | null
    }
    const masterMap = new Map<string, ProductMaster>()
    for (const m of masterRows ?? []) {
      masterMap.set(m.id, {
        standard_name: m.standard_name,
        default_unit: m.default_unit,
        allowed_units: m.allowed_units,
        pack_unit: m.pack_unit,
        kg_per_pack: m.kg_per_pack,
      })
    }
    for (const item of items) {
      const master = masterMap.get(item.product_id)
      if (!master) continue
      const allowed = master.allowed_units && master.allowed_units.length > 0
        ? master.allowed_units
        : [master.default_unit]
      if (!allowed.includes(item.unit)) {
        // 마스터 허용 단위에 없으면 default_unit 으로 강제 — kg/box 잘못 들어오는 케이스 차단
        item.unit = master.default_unit
      }
      const packed = toPackQty(item.qty, item.unit, master)
      if (packed) {
        item.qty = packed.qty
        item.unit = packed.unit
        serverPricedItems.add(item)
      } else if (
        master.pack_unit &&
        normalizeUnit(item.unit) === normalizeUnit(master.pack_unit) &&
        normalizeUnit(master.pack_unit) !== normalizeUnit(master.default_unit)
      ) {
        // 앱 화면에서 이미 kg→포장 단위로 바꿔 보낸 경우도 포장 단가를 서버에서 확정한다.
        serverPricedItems.add(item)
      }
    }
  }

  // --- 안전망: 클라이언트가 가격/공급처를 못 채워 보냈으면 서버에서 자동 보정 ---
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

    const unitOf = Object.fromEntries(items.map(item => [item.product_id, item.unit]))
    const { priceMap } = await buildPriceMapByProduct(
      adminDb,
      productIds,
      businessDate,
      restaurant.organization_id,
      unitOf,
    )

    for (const item of items) {
      if (!item.supplier_product_id) {
        const spId = productToSp[item.product_id]
        if (spId) item.supplier_product_id = spId
      }
      if (serverPricedItems.has(item)) {
        // kg 단가를 포장 단가로 오인하지 않도록 변환된 줄은 반드시 다시 계산한다.
        item.unit_price_snapshot = priceMap[item.product_id] ?? 0
      } else if (item.unit_price_snapshot <= 0) {
        const price = priceMap[item.product_id]
        if (price !== undefined) item.unit_price_snapshot = price
      }
    }
  }

  try {
    let batchId: string | null = null
    let orderId: string | null = null

    // 식당+영업일자로 배치를 다시 확인해 클라이언트가 보낸 다른 업체 ID를 신뢰하지 않는다.
    const { data: existingBatch } = await adminDb
      .from('order_batches')
      .select('id, status')
      .eq('restaurant_id', restaurantId)
      .eq('business_date', businessDate)
      .maybeSingle()

    if (existingBatchId && existingBatch?.id !== existingBatchId) {
      return NextResponse.json({ error: '발주 일자 정보가 올바르지 않습니다.' }, { status: 400 })
    }

    if (existingBatch && !['open', 'submitted'].includes(existingBatch.status)) {
      return NextResponse.json({ error: '배송 진행 중이거나 완료된 발주는 수정할 수 없습니다. 다음 배송일을 선택해주세요.' }, { status: 409 })
    }

    if (existingBatch) {
      batchId = existingBatch.id
    } else {
      const { data: newBatch, error: batchError } = await adminDb
        .from('order_batches')
        .insert({ restaurant_id: restaurantId, business_date: businessDate, status: 'open' })
        .select('id').single()
      if (batchError) return NextResponse.json({ error: `배치 생성 실패: ${batchError.message}` }, { status: 500 })
      batchId = newBatch.id
    }

    const { data: existingOrder } = await adminDb
      .from('orders').select('id').eq('batch_id', batchId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    // 낡은 화면에서 온 제출은 막는다. 여기를 통과시키면 아래에서 order_items 를 전부
    // 지우므로, 화면에 안 실린 품목이 통째로 사라진다 (2026-09-11 일산킨텍스 오발주).
    if (isStaleOrderSubmit({
      declaresOrderState,
      clientOrderId: existingOrderId ?? null,
      serverOrderId: existingOrder?.id ?? null,
    })) {
      return NextResponse.json(
        { error: '이미 접수된 발주가 있습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.' },
        { status: 409 })
    }

    if (existingOrder) {
      orderId = existingOrder.id
    } else {
      const timestamp = Date.now().toString(36).toUpperCase()
      const { data: order, error: orderError } = await adminDb
        .from('orders')
        .insert({ batch_id: batchId, order_no: `FL-${timestamp}`, source_type: 'web', version: 1 })
        .select('id').single()
      if (orderError) return NextResponse.json({ error: `주문 생성 실패: ${orderError.message}` }, { status: 500 })
      orderId = order.id
    }

    // 지우기 전에 보관해 둔다. 다른 날 발주를 덮어쓰는 사고가 나도 되살릴 수 있어야 한다.
    await archiveOrderItems(adminDb, orderId)

    // 기존 아이템 삭제 전 FK 제약 해제 (dispatch_job_items, daily_spec_lines)
    const { data: existingItems } = await adminDb
      .from('order_items').select('id').eq('order_id', orderId)
    const existingItemIds = (existingItems ?? []).map((i: { id: string }) => i.id)
    if (existingItemIds.length > 0) {
      await adminDb.from('dispatch_job_items').delete().in('order_item_id', existingItemIds)
      await adminDb.from('daily_spec_lines').update({ order_item_id: null }).in('order_item_id', existingItemIds)
    }

    // 기존 아이템 삭제 후 재삽입 (adminDb: submitted 상태 배치도 RLS 우회)
    await adminDb.from('order_items').delete().eq('order_id', orderId)

    if (items.length > 0) {
      const { error: insertError } = await adminDb
        .from('order_items')
        .insert(items.map(item => ({ ...item, order_id: orderId })))
      if (insertError) return NextResponse.json({ error: `아이템 저장 실패: ${insertError.message}` }, { status: 500 })
    }

    // 제출 상태 변경 + daily_spec 자동 생성
    if (isSubmit) {
      const { error: batchError } = await adminDb
        .from('order_batches')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', batchId)
      if (batchError) return NextResponse.json({ error: `제출 실패: ${batchError.message}` }, { status: 500 })

      // 발주 → 명세서 동기화. 관리자가 손으로 넣은 단가·추가 품목은 그대로 둔다.
      // 예전에는 여기서 라인을 전부 지우고 다시 넣어, 손으로 넣은 값이 날아갔다.
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
