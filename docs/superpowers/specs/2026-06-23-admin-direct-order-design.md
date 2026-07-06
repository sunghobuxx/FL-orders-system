# 어드민 직접 발주 입력 구현 설계

## Goal
어드민이 회원 페이지에 별도 로그인하지 않고, 어드민 패널에서 직접 업체별 발주를 입력할 수 있도록 한다.

## Architecture
- 신규 페이지: `/admin/orders/direct` (서버 컴포넌트 + 클라이언트 폼)
- 기존 `saveOrderItems` action 재활용 (이미 `createAdminClient()` 사용, 수정 불필요)
- 사이드바에 링크 1줄 추가

## Global Constraints
- `runtime = 'edge'` 필수 (모든 admin 페이지 동일)
- 기존 메인 메뉴 구조 변경 금지 — 사이드바에 링크 추가만 허용
- `saveOrderItems` 함수 내부 수정 금지 — 그대로 호출
- 자동발송 로직(`auto-dispatch`) 변경 금지 — 기존 2:30 시각 기준 그대로 동작
- 날짜 마감(cutoff) 체크 제거 — 어드민은 시간 제한 없이 입력 가능

## Files

### New
- `apps/web/app/admin/orders/direct/page.tsx` — 서버 컴포넌트. 전체 활성 업체 목록과 각 업체의 배정 품목 목록 로드
- `apps/web/app/admin/orders/direct/AdminDirectOrderForm.tsx` — 클라이언트 컴포넌트. 업체 선택/날짜/품목 입력/제출 UI

### Modified
- `apps/web/app/admin/layout.tsx` — 사이드바 "발주 통합" 아래 "직접 발주 입력" 링크 추가

## Data Flow

```
page.tsx (서버)
  ├─ adminDb.from('restaurants').select('id, organizations(name)').eq('waiting_enabled', false도 포함 — 모든 활성 식당)
  ├─ adminDb.from('order_products').select(...)  → 각 업체 배정 품목
  └─ adminDb.from('products').select(...)        → 전체 품목 (추가용)
       ↓ props
AdminDirectOrderForm.tsx (클라이언트)
  ├─ 업체 선택 드롭다운
  ├─ 날짜 입력 (기본값: 오늘 KST)
  ├─ 배정 품목 수량 입력 테이블
  ├─ "+ 품목 추가" → 전체 품목 검색 모달
  └─ 제출 → saveOrderItems(formData) 호출
       ↓
order_batches + order_items 생성 (기존 로직과 동일)
       ↓ 자동 반영
- /admin/orders/history (발주내역)
- /member/order-history (회원 주문내역)
```

## UI Flow

1. 업체 선택 드롭다운 (활성 식당 전체)
2. 발주 날짜 입력 (기본: 오늘 KST, 자유 변경 가능)
3. 해당 업체 배정 품목 리스트 + 수량 입력
4. "+ 품목 추가" 버튼 → 전체 품목 검색 후 추가
5. "발주 등록" 제출 → 성공 시 /admin/orders 이동

## Dispatch 연동 (변경 없음)

- 기존 2:30 자동발송은 `business_date` 기준으로 `submitted` 상태 batch를 조회
- 어드민이 2:30 이전에 등록한 발주 → 자동 포함
- 2:30 이후 등록 → 자동 제외 (별도 SMS 발송 없음)
- 배송완료 처리 → 기존 /admin/orders 에서 동일하게 처리

## Order/Batch Status

어드민 직접 입력은 `saveOrderItems(isSubmit=true)` 호출:
- batch status = `submitted` (회원 제출과 동일)
- 이후 admin orders 화면에서 동일하게 관리

## Key Reuse

`apps/web/app/member/order/actions.ts`의 `saveOrderItems`:
- `restaurant_id`, `business_date`, `items`, `submit=true` 파라미터만 전달
- 내부적으로 `createAdminClient()` 사용 → 세션 불필요
- batch 생성/업데이트, order_items upsert, 가격 자동 보정 모두 기존 로직 그대로
