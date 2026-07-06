
# 어드민 전체 매출관리 설계

- 작성일: 2026-06-17
- 경로: `app/admin/sales`
- 상태: 설계 승인 완료, 구현 계획 작성 대기

## 목적

어드민이 한 화면에서 전체 매출과 매입을 월 단위로 파악한다.

1. 월별 전체 매출·매입 요약
2. 일별 매출을 달력으로 확인
3. 일자 클릭 시 업체별(식당) 상세내역 확인

## 범위 결정 (확정 사항)

- **위치**: 새 통합 페이지 `/admin/sales`. 기존 `admin/purchase`(매입), `admin/settlement/specs`(명세서 그리드), `admin/finance`(미수금)는 그대로 두고 링크로 연결.
- **달력 범위**: 달력과 일자 드릴다운은 **매출만**. 매입은 상단 요약 카드에서만 확인. 매입 일별 상세는 기존 `admin/purchase`로 링크.
- **상세 깊이**: 일자 클릭 시 **업체별 합계 목록 + 명세서 링크**. 품목별 내역은 기존 당일명세서 상세(`settlement/specs/[specId]`)에서 확인.
- **상세 표시 방식**: 달력 아래 **인라인 패널**(별도 페이지/드로어 아님).
- **달력 구현**: 라이브러리 없이 직접 CSS-grid(`grid-cols-7`). 기존 `settlement/specs`의 월 네비게이터 패턴 재사용. 차트 라이브러리 추가 없음.

## 아키텍처

- `app/admin/sales/page.tsx` — 서버 컴포넌트, `createAdminClient()` 사용 (기존 admin 페이지와 동일 패턴).
- 상태는 **URL 쿼리 파라미터**로 관리 (기존 `admin/purchase`의 `from/to` 방식과 동일):
  - `?month=YYYY-MM` — 보고 있는 달 (기본: 이번 달, `getKstToday()` 기준)
  - `?date=YYYY-MM-DD` — 선택한 날짜. 있으면 달력 아래 인라인 패널 렌더.
- 클라이언트 JS 거의 불필요 — 달력 칸과 식당 행이 모두 `<Link>`. 새로고침·공유에도 상태 유지.
- 집계 로직은 `lib/sales-overview.ts` 헬퍼로 분리. 페이지는 호출만 담당 (테스트·재사용 용이).

## 데이터 / 집계

모든 집계는 `business_date` 기준, 선택한 달의 1일~말일 범위.

| 지표 | 소스 | 계산 |
|---|---|---|
| 일별 매출 (달력 칸) | `daily_specs` | `business_date`별 `total_amount` 합계 |
| 총매출 | `daily_specs` | 이번 달 합계 |
| 총매입 | `purchase_items` | 이번 달 `amount` 합계 |
| 순이익 | 계산 | 총매출 − 총매입 |
| 전월 대비 증감 | 위 쿼리 한 번 더 | 지난달 같은 기간 대비 매출/매입 (%) |
| 미수금 | `receivables` | `status in (unpaid, partial, overdue)`의 `balance` 합 (현재 시점, 월 무관) |
| 미지급 | `payables` | 위와 동일 (공급처 쪽) |
| 일평균 매출 | 계산 | 총매출 ÷ (이번 달 매출 발생일 수) |
| 업체별 상세 (인라인 패널) | `daily_specs` + `organizations(name)` | 선택 날짜의 식당별 `total_amount`, 각 행은 명세서 상세로 링크 |

### 주요 테이블 (읽기 전용)

- `daily_specs` (id, restaurant_id, business_date, total_amount) — 매출 일별 명세 헤더
- `purchase_items` (id, supplier_id, business_date, amount) — 매입 라인
- `receivables` (restaurant_id, balance, status) — 미수금 잔액
- `payables` (supplier_id, balance, status) — 미지급 잔액
- `restaurants` → `organizations(name)` — 업체명 조인

## UI 레이아웃 (위 → 아래)

1. **월 네비게이터** — `‹ 2026년 6월 ›` (기존 specs 패턴 재사용)
2. **요약 카드** — 총매출 / 총매입 / 순이익 / 미수금 / 미지급 / 일평균매출. 각 카드에 전월 대비 증감 배지(▲/▼ %).
3. **월 달력** — `grid-cols-7`. 각 칸: 날짜 + 그날 매출액. 매출 있는 날 강조, 선택된 날 테두리. 칸 클릭 → `?date=` 세팅.
4. **인라인 상세 패널** (`?date` 있을 때만) — "N월 N일 업체별 매출" 제목 + 식당별 합계 목록(금액 큰 순). 각 행 클릭 → 해당 식당 당일명세서(`settlement/specs/[specId]`)로 이동. 하단 합계 행.

## 엣지 케이스 / 에러 처리

- 매출·명세서 없는 날 → 칸은 비어있거나 "0", 패널은 "해당 일자 매출 없음".
- 미래 달 네비게이션 → 허용하되 데이터 0.
- `daily_spec`은 있으나 식당 organization 이름이 없는 경우 → 식당 ID 또는 대체명 표시 (기존 명세서 페이지의 처리 패턴 따름).
- 모든 쿼리 admin 클라이언트(RLS 우회) → 권한 이슈 없음. admin 레이아웃 인증 가드는 기존 그대로 사용.

## 테스트

- `lib/sales-overview.ts` 집계 헬퍼 단위 테스트:
  - 월 경계(1일/말일) 포함 여부
  - 매출 0인 날 처리
  - 전월 대비 증감 계산 (전월 0일 때 분모 처리 포함)
  - 일평균 분모 = 매출 발생일 수
- 기존 작동 코드(`daily_specs`, `purchase_items`, `receivables`, `payables` 쿼리)는 수정하지 않고 읽기만 함 — "작동 확인 코드 수정 금지" 정책 준수.

## 비범위 (YAGNI)

- 차트/그래프 라이브러리 (달력이 일별 시각화 역할)
- 달력 위 매입 표시 (요약 카드에서만)
- 일자 패널 내 품목별 펼치기 (명세서 상세 페이지로 위임)
- 별도 날짜 페이지/드로어 UI
