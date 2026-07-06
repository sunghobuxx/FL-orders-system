# FruitLife 모바일 앱 설계 스펙

**날짜:** 2026-06-22  
**대상:** 회원(식당 관계자) iOS + Android  
**배포:** App Store + Google Play (EAS Build)  
**코드 위치:** `apps/mobile/`

---

## 1. 전체 아키텍처

```
[Expo 앱 (iOS + Android)]
     │
     ├── 발주 / 정산 / 공지 / 문의
     │        └── 기존 Supabase (bkfkaugevqvbibjaasbj)
     │                  ← 기존 웹앱과 동일한 DB, 스키마 변경 없음
     │
     └── 웨이팅 탭
              └── 새 Supabase 프로젝트 (웨이팅 전용)
                       ← Realtime 구독으로 실시간 대기 목록
                       ← 자리남 버튼 → Solapi 알림톡 발송

[QR 웹 페이지] (기존 Next.js에 새 라우트 추가)
     └── /waiting/[restaurantId] → 새 Supabase에 대기 신청 저장

[기존 Next.js 웹앱] → 변경 없음, 병행 운영
```

### 기술 스택

- Expo SDK 54 + Expo Router v6 (기존 설정 유지)
- EAS Build (App Store / Google Play 배포)
- React Native 0.81 + TypeScript
- Supabase JS SDK (클라이언트 2개 — 기존 / 웨이팅 전용)
- Expo Notifications (푸시 알림 — 공지 연동)
- Solapi (카카오 알림톡 — 기존 사용 중)

---

## 2. 기존 코드 현황 (apps/mobile/)

이미 작성된 코드가 있으며, 활용 가능한 것과 수정이 필요한 것을 구분한다.

| 파일 | 상태 | 처리 방향 |
|---|---|---|
| `lib/supabase.ts` | ❌ 버그 | Supabase URL 수정 필수 (`nvpaggacvbotgqyxfdof` → `bkfkaugevqvbibjaasbj`) |
| `app/(tabs)/_layout.tsx` | ⚠️ 수정 | 탭 재구성 (내 정보 제거 → 웨이팅 추가, 공지→공지·문의 통합) |
| `app/(tabs)/index.tsx` | ⚠️ 수정 | 홈에 추가 카드들 반영 (납품 단가, 수급 예측 등) |
| `app/(tabs)/order.tsx` | ✅ 재사용 | 발주 입력/확인/내역 완성 |
| `app/(tabs)/settlement.tsx` | ✅ 재사용 | 미수금/정산 내역 완성 |
| `app/(tabs)/notices.tsx` | ✅ 재사용 | 공지·문의 탭 내부 구조 완성 (탭 이름만 변경) |
| `app/(tabs)/profile.tsx` | ✅ 재사용 | 헤더 아이콘으로 이동, 파일은 유지 |
| `app/inquiry/`, `app/notice/` | ✅ 재사용 | 상세 화면 완성 |
| `app/login.tsx` | ✅ 재사용 | 로그인 화면 |
| `app.json`, `eas.json` | ✅ 유지 | 배포 설정 완료 |

---

## 3. 앱 화면 구성

### 하단 탭바 (5개)

| 탭 | 기능 요약 |
|---|---|
| 홈 | 발주 현황, 미수금, 납품 단가, 납품 분석, 수급 예측, 공지 미리보기 |
| 발주 | 품목 선택 → 수량 입력 → 제출 / 이력 |
| 정산 | 미수금 현황 + 기간별 정산 내역 |
| 웨이팅 | 대기 목록, QR, 자리남/입장 버튼 |
| 공지·문의 | 공지 피드 + 문의/클레임 작성 |

**프로필 / 로그아웃** → 홈 우측 상단 아이콘 (헤더)

---

## 4. 홈 화면 (스크롤)

기존 코드 일부 재사용, 아래 카드 순서로 재구성:

1. **오늘 발주 현황 카드** — 제출 여부, 품목 수 (신규)
2. **미수금 요약 카드** — 현재 미수금 합계 (신규)
3. **현재 납품 단가** — 품목별 단가 리스트 (신규, price_snapshots 조회)
4. **이번 주 납품 분석** — 발주일수, 주간 비용, 품목별 추이 (기존 재활용)
5. **수급위험 예측 · 구매 어드바이스** — AI 분석 (기존 재활용, weekly_insights 테이블)
6. **최근 공지 미리보기** — 최근 3개 (기존 재활용)

---

## 5. 발주 탭

기존 `order.tsx` 그대로 재사용.

- 발주 입력 / 발주 확인 / 발주 내역 (내부 서브탭 3개)
- `order_batches`, `orders`, `order_items` 테이블 사용

---

## 6. 정산 탭

기존 `settlement.tsx` 그대로 재사용.

- 미수금 현황 + 기간별 정산 내역
- `receivables`, `daily_specs` 테이블 사용

---

## 7. 웨이팅 탭 (신규)

### 7-1. 데이터 구조 (새 Supabase 프로젝트)

```sql
restaurants
  id            UUID PK
  name          TEXT
  owner_user_id TEXT  -- 기존 Supabase auth user_id와 연결

waiting_entries
  id            UUID PK
  restaurant_id UUID FK → restaurants.id
  name          TEXT         -- 손님 이름
  phone         TEXT         -- 손님 전화번호
  party_size    INT          -- 인원수
  status        TEXT         -- waiting / called / seated / cancelled / no_show
  called_at     TIMESTAMPTZ
  seated_at     TIMESTAMPTZ
  created_at    TIMESTAMPTZ
```

### 7-2. 상태 흐름

```
waiting
  └→ called    (자리남 버튼 → Solapi 알림톡 발송)
       └→ seated   (입장 버튼 → 완료)
       └→ no_show  (노쇼 버튼)
  └→ cancelled (업주 취소)
```

### 7-3. 업주 앱 버튼 구성

| 상태 | 표시 버튼 |
|---|---|
| waiting | 자리남 / 취소 |
| called | 입장 / 노쇼 |
| seated | 완료 (표시만) |
| cancelled / no_show | 표시만 |

### 7-4. 웨이팅 탭 화면 구성

- 상단: 내 식당 QR 코드 표시 버튼 (손님에게 보여주는 용도)
- 대기 목록: Realtime 구독, 이름 / 인원수 / 대기 시작 시각 / 버튼
- 완료·취소된 항목은 별도 섹션에 접을 수 있게 표시

### 7-5. 알림톡 발송 (called 전환 시)

```
[FruitLife 웨이팅]
{식당명}에서 자리가 났습니다.
5분 내 입장해 주세요.
```

발송 주체: Expo 앱 → 새 Supabase Edge Function 또는 Next.js API 라우트 경유 → Solapi

---

## 8. 공지·문의 탭

기존 `notices.tsx` 재사용 (탭 이름만 "공지사항" → "공지·문의"로 변경).

- 공지 서브탭: 공지 목록 + 상세
- 문의 서브탭: 문의/클레임 목록 + 새 문의 작성
- `notices`, `inquiries` 테이블 사용

---

## 9. QR 웹 페이지 (Next.js 신규 라우트)

- 경로: `apps/web/app/waiting/[restaurantId]/page.tsx`
- 기존 Next.js 코드 건드리지 않고 새 파일로 추가
- 새 Supabase (웨이팅 전용) anon key 사용
- 모바일 최적화 단순 폼: 이름 / 전화번호 / 인원수
- 제출 완료 시 안내 메시지 표시

---

## 10. 개발 우선순위

| 순서 | 작업 | 비고 |
|---|---|---|
| 1 | `lib/supabase.ts` URL 버그 수정 | 최우선, 이게 없으면 모든 기능 불통 |
| 2 | `_layout.tsx` 탭 재구성 | 웨이팅 탭 추가, 내 정보 탭 제거 |
| 3 | `index.tsx` 홈 카드 추가 | 발주 현황, 미수금, 납품 단가, 수급 예측 |
| 4 | `waiting.tsx` 신규 | 웨이팅 탭 전체 |
| 5 | 새 Supabase 프로젝트 생성 | 웨이팅 DB 스키마 |
| 6 | QR 웹 페이지 | Next.js 신규 라우트 |
| 7 | 알림톡 API 연동 | called 상태 전환 시 발송 |

---

## 11. 개발 범위 외

- 관리자(admin) 기능은 모바일 앱 미포함 (웹에서 운영)
- 결제 PG(토스) 연동은 별도 논의
- 기존 Next.js 웹앱 코드 수정 없음 (QR 페이지 신규 파일만 추가)
