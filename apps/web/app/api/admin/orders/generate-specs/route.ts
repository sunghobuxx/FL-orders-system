export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

// 단가 적용 우선순위:
// 0. org_product_prices에 해당 업체+상품 존재 → price_overridden=true로 저장
// 1. effective_from = businessDate (당일 단가)
// 2. is_fixed_price=true → effective_from 무관 최근 단가
// 3. carry-forward (effective_from ≤ businessDate 중 가장 최근)
async function buildPriceMapByProduct(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminDb: any,
  productIds: string[],
  businessDate: string,
  organizationId: string | null,
): Promise<{ priceMap: Record<string, number>; orgOverrides: Set<string> }> {
  if (!productIds.length) return { priceMap: {}, orgOverrides: new Set() }

  const priceMap: Record<string, number> = {}
  const orgOverrides = new Set<string>()

  // 우선순위 0: 업체별 고정단가
  if (organizationId) {
    const { data: orgPrices } = await adminDb
      .from('org_product_prices')
      .select('product_id, unit_price')
      .eq('organization_id', organizationId)
      .in('product_id', productIds)
    for (const row of orgPrices ?? []) {
      priceMap[row.product_id] = Number(row.unit_price)
      orgOverrides.add(row.product_id)
    }
  }

  // 이하 기존 로직 그대로 (supplier_products, price_snapshots 조회)
  const { data: spRows } = await adminDb
    .from('supplier_products').select('id, product_id')
    .in('product_id', productIds).eq('status', 'active')
  if (!spRows?.length) return { priceMap, orgOverrides }

  const spIds = (spRows as Array<{id: string; product_id: string}>).map(r => r.id)
  const spToProduct = Object.fromEntries((spRows as Array<{id: string; product_id: string}>).map(r => [r.id, r.product_id]))

  const { data: products } = await adminDb
    .from('products').select('id, is_fixed_price').in('id', productIds)
  const fixedMap = Object.fromEntries(
    (products ?? []).map((p: {id: string; is_fixed_price: boolean}) => [p.id, p.is_fixed_price])
  )

  // 우선순위 1: 배송날짜와 동일한 날짜에 입력된 단가
  const { data: exactSnaps } = await adminDb
    .from('price_snapshots').select('supplier_product_id, sale_price')
    .in('supplier_product_id', spIds)
    .eq('effective_from', businessDate)
    .order('created_at', { ascending: false })
  for (const snap of exactSnaps ?? []) {
    const pid = spToProduct[snap.supplier_product_id]
    if (pid && priceMap[pid] === undefined) priceMap[pid] = Number(snap.sale_price)
  }

  // 우선순위 2: 고정단가 품목
  const fixedNeedIds = productIds.filter(id => priceMap[id] === undefined && fixedMap[id])
  const fixedSpIds = (spRows as Array<{id: string; product_id: string}>)
    .filter(r => fixedNeedIds.includes(r.product_id)).map(r => r.id)
  if (fixedSpIds.length) {
    const { data: fixedSnaps } = await adminDb
      .from('price_snapshots').select('supplier_product_id, sale_price')
      .in('supplier_product_id', fixedSpIds)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false })
    for (const snap of fixedSnaps ?? []) {
      const pid = spToProduct[snap.supplier_product_id]
      if (pid && priceMap[pid] === undefined) priceMap[pid] = Number(snap.sale_price)
    }
  }

  // 우선순위 3: carry-forward
  const remainSpIds = (spRows as Array<{id: string; product_id: string}>)
    .filter(r => priceMap[r.product_id] === undefined).map(r => r.id)
  if (remainSpIds.length) {
    const { data: carrySnaps } = await adminDb
      .from('price_snapshots').select('supplier_product_id, sale_price')
      .in('supplier_product_id', remainSpIds)
      .lte('effective_from', businessDate)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false })
    for (const snap of carrySnaps ?? []) {
      const pid = spToProduct[snap.supplier_product_id]
      if (pid && priceMap[pid] === undefined) priceMap[pid] = Number(snap.sale_price)
    }
  }

  return { priceMap, orgOverrides }
}

export async function POST(req: Request) {
  try {
    const { businessDate } = await req.json() as { businessDate: string }
    if (!businessDate) return NextResponse.json({ error: '날짜 누락' }, { status: 400 })

    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    // 데이터 작업은 service role 로 한다. 세션(RLS)으로 쓰면 막혀도 에러가 안 나
    // 조용히 실패하거나 조회가 null 이 되어 엉뚱한 404 가 난다.
    const adminDb = createAdminClient()

    const { data: batches } = await adminDb
      .from('order_batches').select('id, restaurant_id')
      .eq('business_date', businessDate)
      .in('status', ['validated', 'ordered', 'dispatched', 'completed'])

    if (!batches?.length) return NextResponse.json({ error: '명세서를 생성할 배치가 없습니다.' }, { status: 400 })

    // restaurant_id → organization_id 매핑 일괄 조회
    const restaurantIds = [...new Set(batches.map((b: { restaurant_id: string }) => b.restaurant_id))]
    const { data: restaurantRows } = await adminDb
      .from('restaurants').select('id, organization_id').in('id', restaurantIds)
    const restaurantOrgMap = Object.fromEntries(
      (restaurantRows ?? []).map((r: { id: string; organization_id: string | null }) => [r.id, r.organization_id])
    )

    let created = 0
    for (const batch of batches) {
      const organizationId: string | null = restaurantOrgMap[batch.restaurant_id] ?? null

      const { data: orders } = await adminDb.from('orders').select('id').eq('batch_id', batch.id)
      const orderIds = (orders ?? []).map((o: { id: string }) => o.id)
      if (!orderIds.length) continue

      const { data: items } = await adminDb
        .from('order_items').select('id, product_id, qty, unit').in('order_id', orderIds)
      if (!items?.length) continue

      const productIds = [...new Set(items.map((i: { product_id: string }) => i.product_id))]
      const { priceMap, orgOverrides } = await buildPriceMapByProduct(adminDb, productIds, businessDate, organizationId)

      // 기존 명세서가 있으면 지우지 않고 그 위에 갱신한다.
      // 명세서를 delete 후 재생성하면 관리자가 손으로 고친 수량·단가가 전부 날아간다.
      // 단가 우선순위 1순위는 "명세서 수동 단가는 절대 건드리지 말 것" 이다.
      //
      // maybeSingle() 을 쓰지 않는 이유: 같은 식당·날짜에 명세서가 2개 이상이면
      // maybeSingle 은 에러를 내고 null 을 돌려준다. 그러면 여기서 명세서를 하나 더
      // 만들어 중복이 계속 늘어난다. 가장 오래된 것을 기준으로 삼는다.
      const { data: existingSpecs } = await adminDb
        .from('daily_specs').select('id')
        .eq('restaurant_id', batch.restaurant_id).eq('business_date', businessDate)
        .order('created_at', { ascending: true })

      let specId: string | null = existingSpecs?.[0]?.id ?? null
      if (!specId) {
        const { data: spec, error: specError } = await adminDb
          .from('daily_specs')
          .insert({ restaurant_id: batch.restaurant_id, business_date: businessDate, total_amount: 0, vat_amount: 0 })
          .select('id').single()
        if (specError || !spec) continue
        specId = spec.id
      }

      // 수동으로 고친 라인은 품목 기준으로 찾아 그대로 둔다.
      // (order_item_id 는 발주 재제출 때 NULL 로 끊기므로 기준이 될 수 없다)
      const { data: existingLines } = await adminDb
        .from('daily_spec_lines')
        .select('id, product_id, qty, unit, unit_price, vat_amount, price_overridden')
        .eq('daily_spec_id', specId)

      type ExistingLine = { id: string; product_id: string; qty: number; unit: string; unit_price: number; vat_amount: number; price_overridden: boolean }
      const keepByProduct = new Map<string, ExistingLine>()
      for (const l of (existingLines ?? []) as ExistingLine[]) {
        if (l.price_overridden) keepByProduct.set(l.product_id, l)
      }

      type SpecLine = {
        order_item_id: string | null
        product_id: string
        qty: number
        unit: string
        unit_price: number
        vat_amount: number
        price_overridden: boolean
      }

      const specLines: SpecLine[] = items.map((item: { id: string; product_id: string; qty: number; unit: string }) => {
        const kept = keepByProduct.get(item.product_id)
        if (kept) {
          // 관리자가 고친 수량·단가를 그대로 유지한다
          return {
            order_item_id: item.id,
            product_id: item.product_id,
            qty: kept.qty,
            unit: kept.unit ?? item.unit,
            unit_price: kept.unit_price,
            vat_amount: kept.vat_amount ?? 0,
            price_overridden: true,
          }
        }
        return {
          order_item_id: item.id,
          product_id: item.product_id,
          qty: item.qty,
          unit: item.unit,
          unit_price: priceMap[item.product_id] ?? 0,
          vat_amount: 0,
          price_overridden: orgOverrides.has(item.product_id),
        }
      })

      // 발주에 없지만 관리자가 직접 추가한 품목도 명세서에 남긴다
      const orderedProductIds = new Set(items.map((i: { product_id: string }) => i.product_id))
      for (const [pid, kept] of keepByProduct) {
        if (orderedProductIds.has(pid)) continue
        specLines.push({
          order_item_id: null,
          product_id: pid,
          qty: kept.qty,
          unit: kept.unit,
          unit_price: kept.unit_price,
          vat_amount: kept.vat_amount ?? 0,
          price_overridden: true,
        })
      }

      const totalAmount = specLines.reduce((s: number, l: { qty: number; unit_price: number; vat_amount: number }) => s + Number(l.qty) * Number(l.unit_price) + Number(l.vat_amount), 0)
      const vatAmount = specLines.reduce((s: number, l: { vat_amount: number }) => s + Number(l.vat_amount), 0)

      await adminDb.from('daily_spec_lines').delete().eq('daily_spec_id', specId)
      await adminDb.from('daily_spec_lines').insert(specLines.map(l => ({ ...l, daily_spec_id: specId })))
      await adminDb.from('daily_specs')
        .update({ total_amount: totalAmount, vat_amount: vatAmount })
        .eq('id', specId)
      created++
    }

    return NextResponse.json({ success: true, created })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '오류 발생' }, { status: 500 })
  }
}
