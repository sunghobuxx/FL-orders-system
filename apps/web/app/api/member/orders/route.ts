export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
  const { user, supabase } = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

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

  // 04:00 KST 이후 당일(오늘) 발주 차단 — 02:00~04:00 는 "마감 후 발주" 로 허용
  // 04:00 이후 오늘 발주 시도 → 차단 (내일 발주만 가능)
  const nowUtc = new Date()
  const kstMs = nowUtc.getTime() + 9 * 60 * 60 * 1000
  const kstNow = new Date(kstMs)
  const kstToday = kstNow.toISOString().split('T')[0]
  const kstMinutes = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes()
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

  const adminDb = createAdminClient()

  // 회원이 속한 업체의 식당인지 검증한다. 이 검증 전에 adminDb로 주문을 수정하면 안 된다.
  const { data: restaurant } = await adminDb
    .from('restaurants')
    .select('id, organization_id')
    .eq('id', restaurantId)
    .maybeSingle()

  if (!restaurant) {
    return NextResponse.json({ error: '식당 정보를 확인할 수 없습니다.' }, { status: 404 })
  }

  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('organization_id', restaurant.organization_id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: '해당 식당의 발주 권한이 없습니다.' }, { status: 403 })
  }

  const productIds = [...new Set(items.map(i => i.product_id))]

  // --- 마스터 강제 검증: 클라이언트가 stale 한 product 정보로 보내도
  //     order_items.unit 은 products.default_unit / allowed_units 와 정합 보장 ---
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
        // 마스터 허용 단위에 없으면 default_unit 으로 강제 — kg/box 잘못 들어오는 케이스 차단
        item.unit = master.default_unit
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

    const spIds = Object.values(productToSp)
    const priceBySp: Record<string, number> = {}
    if (spIds.length > 0) {
      const { data: snaps } = await adminDb
        .from('price_snapshots')
        .select('supplier_product_id, sale_price, effective_from')
        .in('supplier_product_id', spIds)
        .lte('effective_from', businessDate)
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false })
      for (const s of snaps ?? []) {
        if (priceBySp[s.supplier_product_id] === undefined) {
          priceBySp[s.supplier_product_id] = Number(s.sale_price)
        }
      }
    }

    for (const item of items) {
      if (!item.supplier_product_id) {
        const spId = productToSp[item.product_id]
        if (spId) item.supplier_product_id = spId
      }
      if (item.unit_price_snapshot <= 0 && item.supplier_product_id) {
        const price = priceBySp[item.supplier_product_id]
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
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('business_date', businessDate)
      .maybeSingle()

    if (existingBatchId && existingBatch?.id !== existingBatchId) {
      return NextResponse.json({ error: '발주 일자 정보가 올바르지 않습니다.' }, { status: 400 })
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

    if (existingOrderId && existingOrder?.id !== existingOrderId) {
      return NextResponse.json({ error: '발주 정보가 올바르지 않습니다.' }, { status: 400 })
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

      // daily_spec 멱등 생성/갱신: 마감 전 재발주 시 기존 명세서도 최신 품목으로 교체한다.
      const { data: existingSpec } = await adminDb
        .from('daily_specs').select('id')
        .eq('restaurant_id', restaurantId).eq('business_date', businessDate).maybeSingle()
      if (orderId) {
        const { data: oiRows } = await adminDb
          .from('order_items')
          .select('id, product_id, qty, unit, unit_price_snapshot, products(taxable_flag)')
          .eq('order_id', orderId)
        if (oiRows?.length) {
          const lines = oiRows.map((i: {
            id: string; product_id: string; qty: number; unit: string;
            unit_price_snapshot: number; products: { taxable_flag: boolean }[] | { taxable_flag: boolean } | null
          }) => {
            const price = Number(i.unit_price_snapshot ?? 0)
            const qty = Number(i.qty)
            const p = Array.isArray(i.products) ? i.products[0] : i.products
            const taxable = p?.taxable_flag ?? false
            const vat = taxable ? Math.round(qty * price * 0.1) : 0
            return {
              order_item_id: i.id,
              product_id: i.product_id,
              qty, unit: i.unit,
              unit_price: price,
              vat_amount: vat,
            }
          })
          const total = lines.reduce((s, l) => s + l.qty * l.unit_price + l.vat_amount, 0)
          const vatTotal = lines.reduce((s, l) => s + l.vat_amount, 0)
          let specId = existingSpec?.id
          if (specId) {
            const { error: specUpdateError } = await adminDb
              .from('daily_specs')
              .update({ total_amount: total, vat_amount: vatTotal })
              .eq('id', specId)
            if (specUpdateError) {
              return NextResponse.json({ error: `명세서 갱신 실패: ${specUpdateError.message}` }, { status: 500 })
            }
            const { error: lineDeleteError } = await adminDb
              .from('daily_spec_lines')
              .delete()
              .eq('daily_spec_id', specId)
            if (lineDeleteError) {
              return NextResponse.json({ error: `명세서 품목 갱신 실패: ${lineDeleteError.message}` }, { status: 500 })
            }
          } else {
            const { data: spec, error: specInsertError } = await adminDb
              .from('daily_specs')
              .insert({ restaurant_id: restaurantId, business_date: businessDate, total_amount: total, vat_amount: vatTotal })
              .select('id').single()
            if (specInsertError) {
              return NextResponse.json({ error: `명세서 생성 실패: ${specInsertError.message}` }, { status: 500 })
            }
            specId = spec.id
          }

          const { error: lineInsertError } = await adminDb.from('daily_spec_lines').insert(
            lines.map(l => ({ ...l, daily_spec_id: specId! })),
          )
          if (lineInsertError) {
            return NextResponse.json({ error: `명세서 품목 저장 실패: ${lineInsertError.message}` }, { status: 500 })
          }
        }
      }
    }

    return NextResponse.json({ orderId, batchId })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '알 수 없는 오류' }, { status: 500 })
  }
}
