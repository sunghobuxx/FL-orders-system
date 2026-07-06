# 업체별 고정단가 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 업체(organization)별로 특정 상품의 고정단가를 설정하면 명세서 생성 시 자동으로 적용되고, 단가 변경 시 오늘 이후 기존 명세서도 자동 업데이트된다.

**Architecture:** 신규 `org_product_prices` 테이블에 업체+상품 조합의 고정단가를 저장한다. 명세서 생성(`generate-specs`) 시 기존 단가 로직 실행 전에 이 테이블을 먼저 체크하고, 있으면 해당 단가로 `price_overridden = true` 설정한다. 단가 저장 시 `price-snapshots`와 동일한 cascade 패턴으로 기존 spec_lines를 자동 업데이트한다.

**Tech Stack:** Next.js 15 App Router (edge runtime), Supabase Postgres, TypeScript, `createAdminClient()` (service role)

## Global Constraints

- edge runtime: `export const runtime = 'edge'` 필수
- Supabase admin 클라이언트: `createAdminClient()` from `@/lib/supabase/admin`
- 세션 기반 DB: `getSessionUser()` from `@/lib/supabase/server`
- KST 날짜: `getKstToday()` from `@/lib/date-kst`
- `price_overridden` 컬럼은 이미 `daily_spec_lines` 테이블에 존재 (코드에서 사용 중, 마이그레이션 파일에는 없음)
- Server actions: `'use server'`로 시작, `createAdminClient()` 사용
- 경로 alias: `@/*` → `apps/web/` 루트

---

## File Map

| 작업 | 파일 |
|------|------|
| 생성 | `supabase/migrations/20260629000000_org_product_prices.sql` |
| 수정 | `apps/web/app/api/admin/orders/generate-specs/route.ts` |
| 수정 | `apps/web/app/admin/products/actions.ts` |
| 생성 | `apps/web/app/admin/products/[id]/OrgPriceSection.tsx` |
| 수정 | `apps/web/app/admin/products/[id]/page.tsx` |

---

## Task 1: DB 마이그레이션 — `org_product_prices` 테이블 생성

**Files:**
- Create: `supabase/migrations/20260629000000_org_product_prices.sql`

**Interfaces:**
- Produces: `org_product_prices (id, organization_id, product_id, unit_price, created_at)` 테이블
- unique constraint: `(organization_id, product_id)`

- [ ] **Step 1: 마이그레이션 파일 생성**

`supabase/migrations/20260629000000_org_product_prices.sql` 내용:

```sql
-- 업체별 고정단가 테이블
-- organization + product 조합 당 하나의 단가만 허용
create table org_product_prices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  product_id      uuid not null references products(id) on delete cascade,
  unit_price      numeric(12,2) not null,
  created_at      timestamptz default now(),
  unique (organization_id, product_id)
);

-- 어드민(platform/operator) 전용 RLS — 기존 테이블과 동일한 패턴
alter table org_product_prices enable row level security;

create policy "org_product_prices_admin_all" on org_product_prices
  for all using (
    auth.uid() in (
      select m.user_id from memberships m
      join organizations o on o.id = m.organization_id
      where o.organization_type in ('platform', 'operator')
    )
  );
```

- [ ] **Step 2: Supabase Studio에서 마이그레이션 실행**

Supabase Studio → SQL Editor에서 위 SQL을 직접 실행한다.

확인:
- `org_product_prices` 테이블 생성 여부
- RLS 정책 `org_product_prices_admin_all` 생성 여부
- 테스트 insert: `insert into org_product_prices (organization_id, product_id, unit_price) values ('<valid-org-id>', '<valid-product-id>', 10000);`
- unique constraint 테스트: 동일 조합 재삽입 시 오류 발생 확인

- [ ] **Step 3: `price_overridden` 기본값 확인**

Supabase Studio에서 `daily_spec_lines` 테이블을 조회하여 `price_overridden` 컬럼의 default 값이 `false`인지 확인한다. `null`이거나 default가 없으면 아래 SQL 실행:

```sql
-- price_overridden에 default false 설정 (없는 경우에만)
alter table daily_spec_lines alter column price_overridden set default false;
```

---

## Task 2: generate-specs 수정 — org 단가 우선 적용

**Files:**
- Modify: `apps/web/app/api/admin/orders/generate-specs/route.ts`

**Interfaces:**
- Consumes: `org_product_prices (organization_id, product_id, unit_price)`
- `buildPriceMapByProduct` 반환 타입 변경: `Record<string, number>` → `{ priceMap: Record<string, number>; orgOverrides: Set<string> }`

- [ ] **Step 1: `buildPriceMapByProduct` 함수 시그니처 및 org 조회 추가**

`app/api/admin/orders/generate-specs/route.ts`의 `buildPriceMapByProduct` 함수를 아래와 같이 수정한다:

```typescript
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
```

- [ ] **Step 2: POST 핸들러에서 organization_id 조회 및 spec line 생성 수정**

`POST` 함수 안 `for (const batch of batches)` 루프를 아래로 교체한다:

```typescript
export async function POST(req: Request) {
  try {
    const { businessDate } = await req.json() as { businessDate: string }
    if (!businessDate) return NextResponse.json({ error: '날짜 누락' }, { status: 400 })

    const { supabase: adminDb } = await getSessionUser()

    const { data: batches } = await adminDb
      .from('order_batches').select('id, restaurant_id')
      .eq('business_date', businessDate)
      .in('status', ['validated', 'ordered', 'dispatched', 'completed'])

    if (!batches?.length) return NextResponse.json({ error: '명세서를 생성할 배치가 없습니다.' }, { status: 400 })

    // restaurant_id → organization_id 매핑 일괄 조회
    const restaurantIds = [...new Set(batches.map(b => b.restaurant_id))]
    const { data: restaurantRows } = await adminDb
      .from('restaurants').select('id, organization_id').in('id', restaurantIds)
    const restaurantOrgMap = Object.fromEntries(
      (restaurantRows ?? []).map(r => [r.id, r.organization_id])
    )

    let created = 0
    for (const batch of batches) {
      const organizationId: string | null = restaurantOrgMap[batch.restaurant_id] ?? null

      const { data: orders } = await adminDb.from('orders').select('id').eq('batch_id', batch.id)
      const orderIds = (orders ?? []).map(o => o.id)
      if (!orderIds.length) continue

      const { data: items } = await adminDb
        .from('order_items').select('id, product_id, qty, unit').in('order_id', orderIds)
      if (!items?.length) continue

      const productIds = [...new Set(items.map(i => i.product_id))]
      const { priceMap, orgOverrides } = await buildPriceMapByProduct(adminDb, productIds, businessDate, organizationId)

      const { data: products } = await adminDb
        .from('products').select('id, taxable_flag').in('id', productIds)
      const taxMap = Object.fromEntries((products ?? []).map(p => [p.id, p.taxable_flag]))

      const specLines = items.map(item => {
        const unitPrice = priceMap[item.product_id] ?? 0
        const taxable = taxMap[item.product_id] ?? false
        const lineAmount = Number(item.qty) * unitPrice
        const vatAmount = taxable ? Math.round(lineAmount * 0.1) : 0
        return {
          order_item_id: item.id,
          product_id: item.product_id,
          qty: item.qty,
          unit: item.unit,
          unit_price: unitPrice,
          vat_amount: vatAmount,
          price_overridden: orgOverrides.has(item.product_id),
        }
      })

      const totalAmount = specLines.reduce((s, l) => s + Number(l.qty) * Number(l.unit_price) + l.vat_amount, 0)
      const vatAmount = specLines.reduce((s, l) => s + l.vat_amount, 0)

      const { data: existing } = await adminDb
        .from('daily_specs').select('id')
        .eq('restaurant_id', batch.restaurant_id).eq('business_date', businessDate).maybeSingle()
      if (existing) {
        await adminDb.from('daily_specs').delete().eq('id', existing.id)
      }

      const { data: spec, error: specError } = await adminDb
        .from('daily_specs')
        .insert({ restaurant_id: batch.restaurant_id, business_date: businessDate, total_amount: totalAmount, vat_amount: vatAmount })
        .select('id').single()

      if (specError || !spec) continue
      await adminDb.from('daily_spec_lines').insert(specLines.map(l => ({ ...l, daily_spec_id: spec.id })))
      created++
    }

    return NextResponse.json({ success: true, created })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '오류 발생' }, { status: 500 })
  }
}
```

- [ ] **Step 3: 동작 확인**

어드민에서 `org_product_prices`에 테스트 데이터 삽입:
```sql
insert into org_product_prices (organization_id, product_id, unit_price)
values ('<실제 org id>', '<실제 product id>', 99999);
```

어드민 `/admin/settlement/specs`에서 해당 날짜 명세서를 재생성(`발주에서 재생성` 버튼).

Supabase Studio에서 확인:
```sql
select unit_price, price_overridden from daily_spec_lines where product_id = '<product id>';
-- unit_price = 99999, price_overridden = true 이어야 함
```

테스트 데이터 삭제 후 원복.

---

## Task 3: Server Actions — upsertOrgProductPrice + deleteOrgProductPrice

**Files:**
- Modify: `apps/web/app/admin/products/actions.ts`

**Interfaces:**
- `upsertOrgProductPrice(productId: string, organizationId: string, unitPrice: number): Promise<{ success: boolean; error?: string }>`
- `deleteOrgProductPrice(productId: string, organizationId: string): Promise<{ success: boolean; error?: string }>`

- [ ] **Step 1: `upsertOrgProductPrice` 추가**

`app/admin/products/actions.ts`에 아래 함수를 추가한다 (`'use server'` 선언은 이미 있음):

```typescript
import { getKstToday } from '@/lib/date-kst'
import { computeOutstanding, syncStatementFinance } from '@/lib/settlement-finance'
```

그리고 파일 하단에 추가:

```typescript
export async function upsertOrgProductPrice(
  productId: string,
  organizationId: string,
  unitPrice: number,
): Promise<{ success: boolean; error?: string }> {
  const db = createAdminClient()

  // 1. org_product_prices upsert
  const { error } = await db
    .from('org_product_prices')
    .upsert({ organization_id: organizationId, product_id: productId, unit_price: unitPrice },
             { onConflict: 'organization_id,product_id' })
  if (error) return { success: false, error: error.message }

  // 2. 오늘 이후 해당 업체 명세서의 spec_lines 자동 업데이트
  const today = getKstToday()

  // 해당 organization의 restaurants 조회
  const { data: restaurants } = await db
    .from('restaurants').select('id').eq('organization_id', organizationId)
  if (!restaurants?.length) return { success: true }

  const restaurantIds = restaurants.map(r => r.id)

  // 오늘 이후 daily_specs 조회
  const { data: specs } = await db
    .from('daily_specs').select('id')
    .in('restaurant_id', restaurantIds)
    .gte('business_date', today)
  if (!specs?.length) return { success: true }

  const specIds = specs.map(s => s.id)

  // 해당 product의 spec_lines 조회 (price_overridden 무관 — org 단가 변경은 명시적 의도)
  const { data: specLines } = await db
    .from('daily_spec_lines')
    .select('id, daily_spec_id, qty')
    .in('daily_spec_id', specIds)
    .eq('product_id', productId)
  if (!specLines?.length) return { success: true }

  // 과세 여부 조회
  const { data: productMeta } = await db
    .from('products').select('taxable_flag').eq('id', productId).single()
  const taxable = productMeta?.taxable_flag ?? false

  // unit_price + vat_amount + price_overridden 업데이트
  for (const line of specLines) {
    const newVat = taxable ? Math.round(Number(line.qty) * unitPrice * 0.1) : 0
    await db
      .from('daily_spec_lines')
      .update({ unit_price: unitPrice, vat_amount: newVat, price_overridden: true })
      .eq('id', line.id)
  }

  // spec 합계 재계산 → statement cascade
  const affectedSpecIds = [...new Set(specLines.map(l => l.daily_spec_id))]
  for (const specId of affectedSpecIds) {
    const { data: allLines } = await db
      .from('daily_spec_lines').select('amount, vat_amount')
      .eq('daily_spec_id', specId)

    const newSpecTotal = (allLines ?? []).reduce(
      (s, l) => s + Number(l.amount ?? 0) + Number(l.vat_amount ?? 0), 0
    )
    const newSpecVat = (allLines ?? []).reduce((s, l) => s + Number(l.vat_amount ?? 0), 0)

    await db.from('daily_specs')
      .update({ total_amount: newSpecTotal, vat_amount: newSpecVat })
      .eq('id', specId)

    // statement_lines cascade
    const { data: stmtLines } = await db
      .from('sales_statement_lines').select('id, sales_statement_id')
      .eq('source_doc_type', 'daily_spec')
      .eq('source_doc_id', specId)

    for (const stmtLine of stmtLines ?? []) {
      await db.from('sales_statement_lines')
        .update({ amount: newSpecTotal }).eq('id', stmtLine.id)

      const { data: linesOfStmt } = await db
        .from('sales_statement_lines').select('amount')
        .eq('sales_statement_id', stmtLine.sales_statement_id)
      const newStmtTotal = (linesOfStmt ?? []).reduce((s, l) => s + Number(l.amount ?? 0), 0)

      const outstanding = await computeOutstanding(stmtLine.sales_statement_id, newStmtTotal)
      await syncStatementFinance(stmtLine.sales_statement_id, newStmtTotal, outstanding)
    }
  }

  return { success: true }
}
```

- [ ] **Step 2: `deleteOrgProductPrice` 추가**

같은 파일 하단에 추가:

```typescript
export async function deleteOrgProductPrice(
  productId: string,
  organizationId: string,
): Promise<{ success: boolean; error?: string }> {
  const db = createAdminClient()
  const { error } = await db
    .from('org_product_prices')
    .delete()
    .eq('organization_id', organizationId)
    .eq('product_id', productId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}
```

- [ ] **Step 3: import 추가 확인**

`actions.ts` 파일 상단의 import에 추가가 필요하다:

```typescript
import { getKstToday } from '@/lib/date-kst'
import { computeOutstanding, syncStatementFinance } from '@/lib/settlement-finance'
```

현재 import 목록에 없으면 추가한다.

---

## Task 4: 어드민 UI — OrgPriceSection 컴포넌트

**Files:**
- Create: `apps/web/app/admin/products/[id]/OrgPriceSection.tsx`
- Modify: `apps/web/app/admin/products/[id]/page.tsx`

**Interfaces:**
- `OrgPriceSection` props:
  ```typescript
  type OrgPrice = { organization_id: string; orgName: string; unit_price: number }
  type OrgOption = { id: string; name: string }
  interface Props {
    productId: string
    orgPrices: OrgPrice[]
    allOrgs: OrgOption[]
  }
  ```

- [ ] **Step 1: `OrgPriceSection.tsx` 생성**

`apps/web/app/admin/products/[id]/OrgPriceSection.tsx`:

```typescript
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
```

- [ ] **Step 2: `page.tsx`에 데이터 페치 및 OrgPriceSection 삽입**

`app/admin/products/[id]/page.tsx`에서:

1. import 추가:
```typescript
import OrgPriceSection from './OrgPriceSection'
```

2. `Promise.all` 쿼리에 두 가지 추가:

기존:
```typescript
const [{ data: product }, { data: supplierProducts }, { data: suppliers }] = await Promise.all([
  adminDb.from('products').select('*').eq('id', id).single(),
  adminDb
    .from('supplier_products')
    .select('id, purchase_unit, supplier_name, suppliers(id, organizations(name)), price_snapshots(id, sale_price, purchase_price, unit, effective_from, created_at)')
    .eq('product_id', id),
  adminDb.from('suppliers').select('id, status, organizations(name)'),
])
```

변경:
```typescript
const [
  { data: product },
  { data: supplierProducts },
  { data: suppliers },
  { data: orgPriceRows },
  { data: allOrgRows },
] = await Promise.all([
  adminDb.from('products').select('*').eq('id', id).single(),
  adminDb
    .from('supplier_products')
    .select('id, purchase_unit, supplier_name, suppliers(id, organizations(name)), price_snapshots(id, sale_price, purchase_price, unit, effective_from, created_at)')
    .eq('product_id', id),
  adminDb.from('suppliers').select('id, status, organizations(name)'),
  adminDb
    .from('org_product_prices')
    .select('organization_id, unit_price, organizations(name)')
    .eq('product_id', id),
  adminDb
    .from('organizations')
    .select('id, name')
    .eq('organization_type', 'restaurant')
    .eq('status', 'active')
    .order('name'),
])
```

3. 데이터 가공:
```typescript
type OrgPriceRow = { organization_id: string; unit_price: number; organizations: { name: string } | null }
const orgPrices = (orgPriceRows ?? []).map((r: OrgPriceRow) => ({
  organization_id: r.organization_id,
  orgName: r.organizations?.name ?? r.organization_id,
  unit_price: Number(r.unit_price),
}))
type OrgRow = { id: string; name: string }
const allOrgs = (allOrgRows ?? []).map((o: OrgRow) => ({ id: o.id, name: o.name }))
```

4. 렌더링 - `</div>` 닫기 전 (공급처 연결 섹션 아래)에 추가:
```tsx
{/* 업체별 고정단가 */}
<OrgPriceSection
  productId={id}
  orgPrices={orgPrices}
  allOrgs={allOrgs}
/>
```

- [ ] **Step 3: 동작 확인**

1. 어드민 `/admin/products/[id]` 접속
2. 하단 "업체별 고정단가" 섹션 확인
3. 업체 선택 + 단가 입력 → 추가 버튼 클릭
4. 저장 후 Supabase Studio에서 `org_product_prices` 테이블 조회하여 레코드 생성 확인
5. 수정 버튼 클릭 → 단가 변경 → 저장 확인
6. 해당 업체의 오늘 명세서가 있다면 `daily_spec_lines` 자동 업데이트 확인
7. 삭제 버튼 클릭 → 삭제 확인

---

## Self-Review Checklist

- [x] DB 마이그레이션: `org_product_prices` 테이블 + RLS (기존 패턴 사용)
- [x] generate-specs: org override 우선 조회, `price_overridden = true` 설정
- [x] upsertOrgProductPrice: cascade (spec_lines → spec totals → statement_lines → syncStatementFinance) - price-snapshots와 동일 패턴
- [x] deleteOrgProductPrice: 단순 삭제, cascade 없음
- [x] UI: 목록 표시, 추가, 수정, 삭제
- [x] allOrgs 쿼리: `organization_type = 'restaurant'`이고 `status = 'active'`인 업체만 노출
- [x] `getKstToday()` 사용하여 엣지 런타임 호환 날짜 처리
- [x] `price_overridden` 기본값 확인 단계 포함
