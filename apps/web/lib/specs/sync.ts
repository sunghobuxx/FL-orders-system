/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 발주 → 명세서 동기화.
 *
 * 같은 일을 세 곳에서 제각각 하고 있었고 둘이 틀렸다.
 *   admin/orders   명세서가 이미 있으면 아예 손대지 않아, 나중에 추가한 품목이 명세서에 안 들어갔다
 *   member/orders  라인을 전부 지우고 다시 넣어, 관리자가 손으로 넣은 단가·추가 품목이 날아갔다
 *   generate-specs 유일하게 옳았다 — 그 로직을 여기로 옮긴다
 *
 * 규칙
 *   - price_overridden 라인은 품목 기준으로 찾아 수량·단가를 그대로 둔다.
 *     order_item_id 는 재발주 때 NULL 로 끊기므로 기준이 될 수 없다.
 *   - 발주에 없어도 관리자가 손으로 넣은 품목은 명세서에 남긴다.
 *   - 명세서 자체를 지우지 않는다. 지우면 정산서가 참조하는 근거가 사라진다.
 *   - 명세서를 고쳤으면 그 기간 정산서도 같이 갱신한다.
 */

import { generateStatements } from '@/lib/settlement/generate'
import { splitVat } from '@/lib/specs/vat'

/**
 * 단가 우선순위: 업체 고정단가 → 당일단가 → 고정단가 품목 → carry-forward
 *
 * `unitOf` 를 주면 **품목+단위**로 찾는다. 한 품목에 단위가 둘인 경우가 있다 —
 * 양파는 kg 과 bag 을 같이 쓰는데, 단위를 안 보면 bag 으로 시켜도 kg 단가가 붙었다
 * (2026-08-18: 1 bag 에 2,000원). price_snapshots 에는 원래 unit 이 있었는데
 * 조회가 무시하고 최신 한 줄만 집어 왔다.
 *
 * `unitOf` 를 안 주면 그 품목의 **기본 단위**(products.default_unit)로 본다.
 * 예전처럼 최신 스냅샷을 그냥 집으면, 양파에 bag 단가를 새로 넣은 순간 kg 로 시킨
 * 화면까지 17,000원으로 보인다 (2026-08-18).
 *
 * 그 단위 단가가 아예 없으면 단위를 안 가리고 다시 찾는다. 단위별 단가를 안 넣은
 * 품목은 지금까지와 똑같이 동작한다.
 */
export async function buildPriceMapByProduct(
  adminDb: any,
  productIds: string[],
  businessDate: string,
  organizationId: string | null,
  unitOf?: Record<string, string>,
): Promise<{ priceMap: Record<string, number>; orgOverrides: Set<string> }> {
  if (!productIds.length) return { priceMap: {}, orgOverrides: new Set() }

  // 원하는 단위 — 주어진 값이 우선, 없으면 그 품목의 기본 단위.
  const defaultUnitOf: Record<string, string> = {}
  const unitOk = (productId: string, snapUnit: string | null) => {
    const want = unitOf?.[productId] ?? defaultUnitOf[productId]
    return want === undefined || snapUnit === want
  }

  const priceMap: Record<string, number> = {}
  const orgOverrides = new Set<string>()

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

  const { data: spRows } = await adminDb
    .from('supplier_products').select('id, product_id')
    .in('product_id', productIds).eq('status', 'active')
  if (!spRows?.length) return { priceMap, orgOverrides }

  const spIds = (spRows as Array<{ id: string; product_id: string }>).map(r => r.id)
  const spToProduct = Object.fromEntries(
    (spRows as Array<{ id: string; product_id: string }>).map(r => [r.id, r.product_id]))

  const { data: products } = await adminDb
    .from('products').select('id, is_fixed_price, default_unit').in('id', productIds)
  const fixedMap = Object.fromEntries(
    (products ?? []).map((p: { id: string; is_fixed_price: boolean }) => [p.id, p.is_fixed_price]))
  for (const p of (products ?? []) as Array<{ id: string; default_unit: string | null }>) {
    if (p.default_unit) defaultUnitOf[p.id] = p.default_unit
  }

  const { data: exactSnaps } = await adminDb
    .from('price_snapshots').select('supplier_product_id, sale_price, unit')
    .in('supplier_product_id', spIds)
    .eq('effective_from', businessDate)
    .order('created_at', { ascending: false })
  // 1) 원하는 단위 먼저, 2) 없으면 단위를 안 가리고 (기본 단가로 되돌아감)
  for (const pass of [true, false]) {
    for (const snap of exactSnaps ?? []) {
      const pid = spToProduct[snap.supplier_product_id]
      if (!pid || priceMap[pid] !== undefined) continue
      if (pass && !unitOk(pid, snap.unit)) continue
      priceMap[pid] = Number(snap.sale_price)
    }
  }

  // 고정단가 품목도 등록일(effective_from)을 지킨다.
  // 예전에는 effective_from 을 무시하고 최신값을 가져왔다. 그래서 단가를 새로 넣으면
  // 그보다 앞선 날짜의 명세서까지 소급해 바뀌어, 이미 청구한 금액과 어긋났다.
  // 규칙은 "입력한 날짜부터 다음 수정 전까지 적용" 이다(2026-07-31 확인).
  const fixedNeedIds = productIds.filter(id => priceMap[id] === undefined && fixedMap[id])
  const fixedSpIds = (spRows as Array<{ id: string; product_id: string }>)
    .filter(r => fixedNeedIds.includes(r.product_id)).map(r => r.id)
  if (fixedSpIds.length) {
    const { data: fixedSnaps } = await adminDb
      .from('price_snapshots').select('supplier_product_id, sale_price, unit')
      .in('supplier_product_id', fixedSpIds)
      .lte('effective_from', businessDate)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false })
    for (const pass of [true, false]) {
      for (const snap of fixedSnaps ?? []) {
        const pid = spToProduct[snap.supplier_product_id]
        if (!pid || priceMap[pid] !== undefined) continue
        if (pass && !unitOk(pid, snap.unit)) continue
        priceMap[pid] = Number(snap.sale_price)
      }
    }
  }

  const remainSpIds = (spRows as Array<{ id: string; product_id: string }>)
    .filter(r => priceMap[r.product_id] === undefined).map(r => r.id)
  if (remainSpIds.length) {
    const { data: carrySnaps } = await adminDb
      .from('price_snapshots').select('supplier_product_id, sale_price, unit')
      .in('supplier_product_id', remainSpIds)
      .lte('effective_from', businessDate)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false })
    for (const pass of [true, false]) {
      for (const snap of carrySnaps ?? []) {
        const pid = spToProduct[snap.supplier_product_id]
        if (!pid || priceMap[pid] !== undefined) continue
        if (pass && !unitOk(pid, snap.unit)) continue
        priceMap[pid] = Number(snap.sale_price)
      }
    }
  }

  return { priceMap, orgOverrides }
}

interface ExistingLine {
  id: string
  product_id: string
  qty: number
  unit: string
  unit_price: number
  vat_amount: number
  price_overridden: boolean
}

/**
 * 한 식당·한 영업일의 명세서를 발주 내용에 맞춘다.
 * 명세서가 없으면 만들고, 있으면 그 위에 갱신한다.
 *
 * @returns 명세서 id. 발주 품목이 하나도 없으면 null.
 */
export async function syncSpecFromOrders(
  adminDb: any,
  args: { restaurantId: string; businessDate: string; orderIds: string[]; organizationId?: string | null },
): Promise<string | null> {
  const { restaurantId, businessDate, orderIds } = args
  if (!orderIds.length) return null

  const { data: items } = await adminDb
    .from('order_items').select('id, product_id, qty, unit').in('order_id', orderIds)
  if (!items?.length) return null

  let organizationId = args.organizationId ?? null
  if (organizationId === undefined || organizationId === null) {
    const { data: r } = await adminDb
      .from('restaurants').select('organization_id').eq('id', restaurantId).maybeSingle()
    organizationId = r?.organization_id ?? null
  }

  const productIds = [...new Set(items.map((i: { product_id: string }) => i.product_id))] as string[]

  // 주문한 단위로 단가를 찾는다. 같은 품목이라도 kg 과 bag 은 값이 다르다.
  // 한 품목을 두 단위로 시킨 경우는 첫 줄의 단위를 쓴다 — 그럴 땐 어차피 줄마다
  // 손으로 단가를 맞추게 된다.
  const unitOf: Record<string, string> = {}
  for (const i of items as Array<{ product_id: string; unit: string }>) {
    if (i.unit && unitOf[i.product_id] === undefined) unitOf[i.product_id] = i.unit
  }

  const { priceMap, orgOverrides } = await buildPriceMapByProduct(
    adminDb, productIds, businessDate, organizationId, unitOf)

  // 과세 여부를 보고 부가세를 계산한다.
  // 예전에는 vat_amount 를 무조건 0 으로 넣었다. 그래서 발주로 새로 만들어진 명세서 줄은
  // 과세 품목이어도 부가세가 빠졌고, 나중에 단가를 다시 등록하거나 재계산 버튼을 눌러야만
  // 채워졌다. 같은 품목이 날짜마다 부가세가 붙었다 안 붙었다 했다.
  // (2026-08-02 하이퐁: 7/24 는 16,500 인데 8/1 은 15,000)
  const { data: taxRows } = await adminDb
    .from('products').select('id, taxable_flag').in('id', productIds)
  const taxable = new Map(
    (taxRows ?? []).map((p: { id: string; taxable_flag: boolean | null }) => [p.id, Boolean(p.taxable_flag)]))
  // 품목 마스터 단가는 부가세 포함 금액이다. 위에 10% 를 얹지 않고 그 안에서 나눈다.
  const splitOf = (productId: string, qty: number, unitPrice: number) =>
    splitVat(Boolean(taxable.get(productId)), qty, unitPrice)

  // maybeSingle() 을 쓰지 않는다. 같은 식당·날짜에 명세서가 둘이면 에러 후 null 이 되어
  // 명세서를 하나 더 만들고, 중복이 계속 늘어난다. 가장 오래된 것을 기준으로 삼는다.
  const { data: existingSpecs } = await adminDb
    .from('daily_specs').select('id')
    .eq('restaurant_id', restaurantId).eq('business_date', businessDate)
    .order('created_at', { ascending: true })

  let specId: string | null = existingSpecs?.[0]?.id ?? null
  if (!specId) {
    const { data: spec, error } = await adminDb
      .from('daily_specs')
      .insert({ restaurant_id: restaurantId, business_date: businessDate, total_amount: 0, vat_amount: 0 })
      .select('id').single()
    if (error || !spec) throw error ?? new Error('명세서 생성 실패')
    specId = spec.id
  }

  const { data: existingLines } = await adminDb
    .from('daily_spec_lines')
    .select('id, product_id, qty, unit, unit_price, vat_amount, price_overridden')
    .eq('daily_spec_id', specId)

  const keepByProduct = new Map<string, ExistingLine>()
  for (const l of (existingLines ?? []) as ExistingLine[]) {
    if (l.price_overridden) keepByProduct.set(l.product_id, l)
  }

  const specLines = (items as Array<{ id: string; product_id: string; qty: number; unit: string }>)
    .map(item => {
      const kept = keepByProduct.get(item.product_id)
      if (kept) {
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
      const entered = priceMap[item.product_id] ?? 0
      const split = splitOf(item.product_id, Number(item.qty), entered)
      return {
        order_item_id: item.id,
        product_id: item.product_id,
        qty: item.qty,
        unit: item.unit,
        unit_price: split.unitPrice,
        vat_amount: split.vat,
        price_overridden: orgOverrides.has(item.product_id),
      }
    })

  const orderedProductIds = new Set(productIds)
  for (const [pid, kept] of keepByProduct) {
    if (orderedProductIds.has(pid)) continue
    specLines.push({
      order_item_id: null as unknown as string,
      product_id: pid,
      qty: kept.qty,
      unit: kept.unit,
      unit_price: kept.unit_price,
      vat_amount: kept.vat_amount ?? 0,
      price_overridden: true,
    })
  }

  const totalAmount = specLines.reduce(
    (s, l) => s + Number(l.qty) * Number(l.unit_price) + Number(l.vat_amount), 0)
  const vatAmount = specLines.reduce((s, l) => s + Number(l.vat_amount), 0)

  await adminDb.from('daily_spec_lines').delete().eq('daily_spec_id', specId)
  const { error: insertError } = await adminDb
    .from('daily_spec_lines').insert(specLines.map(l => ({ ...l, daily_spec_id: specId })))
  if (insertError) throw insertError

  await adminDb.from('daily_specs')
    .update({ total_amount: totalAmount, vat_amount: vatAmount })
    .eq('id', specId)

  // 정산서를 바로 맞춘다.
  // 예전에는 명세서를 새로 만들어도 정산서 총액이 그대로여서, 화면의 명세서 목록에는
  // 새 줄이 보이는데 합계만 옛 금액인 상태가 됐다. 정산서 갱신이 매일 04:00 크론이나
  // 수동 생성 때만 일어났기 때문이다. (2026-08-01 할매 선부점 08-01 312,500원)
  // 완납된 정산서는 건드리지 않는다 — 소급 청구하지 않는다.
  try {
    await generateStatements(adminDb, businessDate, {
      force: true,
      restaurantIds: [restaurantId],
      skipSettled: true,
    })
  } catch (e) {
    // 정산서 갱신이 실패해도 명세서 저장은 되돌리지 않는다. 매일 04:00 크론이 다시 맞춘다.
    console.error('[syncSpecFromOrders] 정산서 갱신 실패', restaurantId, businessDate, e)
  }

  return specId
}
