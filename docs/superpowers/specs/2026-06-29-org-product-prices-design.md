# 업체별 고정단가 (org_product_prices) 설계

**날짜:** 2026-06-29  
**상태:** 승인됨

## 배경

콩나물 등 일부 상품은 업체(식당)마다 적용 단가가 다르다. 현재 단가 시스템(품목 마스터 → price_snapshots)은 상품 단위로만 관리되어 업체별 차등 단가를 지원하지 않는다. 기존 시스템을 변경하지 않고 업체별 고정단가를 명세서 생성 시 자동으로 적용한다.

## 핵심 원칙

- 기존 단가 우선순위 시스템(수동입력→당일단가→고정단가→carry-forward)을 그대로 유지
- `org_product_prices` 테이블에 등록된 업체+상품 조합은 명세서 생성 시 `price_overridden = true`로 저장 → 이후 재계산에서도 보호됨
- 설정되지 않은 업체·상품은 기존 로직 그대로

## DB 스키마

```sql
create table org_product_prices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  product_id      uuid not null references products(id) on delete cascade,
  unit_price      numeric(12,2) not null,
  created_at      timestamptz default now(),
  unique (organization_id, product_id)
);

-- RLS: admin role만 접근 가능
alter table org_product_prices enable row level security;
create policy "admin only" on org_product_prices
  using (auth.jwt() ->> 'role' = 'admin');
```

## 단가 결정 순서 (변경 후)

| 우선순위 | 조건 | 비고 |
|---------|------|------|
| 0 | `org_product_prices`에 해당 업체+상품 존재 | `price_overridden = true`로 저장 |
| 1 | `price_overridden = true` (기존 수동입력) | 기존 그대로 |
| 2 | 당일 단가 (`effective_from = business_date`) | 기존 그대로 |
| 3 | 고정단가 (`is_fixed_price = true`) | 기존 그대로 |
| 4 | Carry-forward | 기존 그대로 |

## 수정 파일

### 1. `app/api/admin/orders/generate-specs/route.ts`

`buildPriceMapByProduct` 함수를 org-aware하게 수정:
- 파라미터에 `organizationId` 추가
- 기존 priceMap 빌드 후 `org_product_prices`에서 해당 org의 override 조회
- override가 있는 product_id는 해당 단가로 덮어씀

명세서 라인 생성 시:
- org override 단가가 적용된 항목은 `price_overridden = true` 설정

### 2. `recalculate-spec` — 수정 없음

기존 동작 그대로: `price_overridden = true` 라인은 건드리지 않는다. org override로 생성된 라인도 `price_overridden = true`이므로 일반 재계산 시 보호됨.

### 3. `app/admin/products/[id]/page.tsx` (편집 페이지)

하단에 **"업체별 고정단가"** 섹션 추가:
- 현재 설정된 업체+단가 목록 표시
- "업체 추가" → 업체 선택(드롭다운) + 단가 입력 → 저장
- 기존 항목 단가 수정 및 삭제 가능

### 4. `app/admin/products/actions.ts` (또는 신규 API route)

- `upsertOrgProductPrice(productId, organizationId, unitPrice)` server action
  - 저장 후 **자동 업데이트**: `daily_spec_lines`에서 해당 org+product 조합이고 `business_date >= 오늘`인 라인의 `unit_price`를 새 단가로 갱신
  - `price_snapshots` 자동 업데이트와 동일한 패턴
- `deleteOrgProductPrice(productId, organizationId)` server action
  - 삭제 시에는 spec_lines 소급 변경 없음 (이미 생성된 명세서는 유지)

## 단가 자동 업데이트 트리거 비교

| 트리거 | 업데이트 범위 | 대상 spec_lines |
|--------|------------|----------------|
| `price_snapshots` 입력 | `effective_from` 날짜 이후 명세서 | `price_overridden = false`인 라인 |
| `org_product_prices` 저장/수정 | 오늘 이후 명세서 | 해당 org+product의 ALL 라인 (org 단가 변경은 명시적 의도) |

## 영향 범위

- 기존 명세서: 영향 없음 (오늘 이전 날짜 spec은 그대로)
- 오늘 이후 명세서: org 단가 저장 시 자동 업데이트
- 신규 명세서 생성: org override 적용 (`price_overridden = true`)
- 재생성(`RegenFromOrderButton`): org override 재적용
- `price_snapshots` 단가 변경 시 자동 업데이트: org override 라인은 `price_overridden = true`이므로 영향 없음

## 미포함 범위

- 모바일 회원 앱: 단가는 어드민 명세서에서만 관리, 회원 앱에는 노출되지 않음
- 오늘 이전 명세서 소급 적용: 오늘부터 적용
