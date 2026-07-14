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
  const { user } = await getSessionUser()
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

      const { data: existingSpec } = await adminDb
        .from('daily_specs').select('id')
        .eq('restaurant_id', restaurantId).eq('business_date', businessDate).maybeSingle()
      if (!existingSpec && orderId) {
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
            return { order_item_id: i.id, product_id: i.product_id, qty, unit: i.unit, unit_price: price, vat_amount: vat }
          })
          const total = lines.reduce((s, l) => s + l.qty * l.unit_price + l.vat_amount, 0)
          const vatTotal = lines.reduce((s, l) => s + l.vat_amount, 0)
          const { data: spec } = await adminDb
            .from('daily_specs')
            .insert({ restaurant_id: restaurantId, business_date: businessDate, total_amount: total, vat_amount: vatTotal })
            .select('id').single()
          if (spec) {
            await adminDb.from('daily_spec_lines').insert(
              lines.map(l => ({ ...l, daily_spec_id: spec.id })),
            )
          }
        }
      }
    }

    return NextResponse.json({ orderId, batchId })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '알 수 없는 오류' }, { status: 500 })
  }
}
