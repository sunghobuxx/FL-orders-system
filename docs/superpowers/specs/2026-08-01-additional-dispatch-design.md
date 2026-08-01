# 추가발주 문자 발송

2026-08-01

## 문제

발주 문자는 새벽 02:30 에 `auto-dispatch` 가 한 번 보낸다. 그 시점의 발주를
`dispatch_job_items` 에 스냅샷으로 남기고, 그 스냅샷으로 문자를 만든다.

02:30 이후에 들어온 발주는 어떤 경로로도 공급처에 전달되지 않는다.

- `auto-dispatch` 는 이미 발송 기록(`dispatch_messages.status='sent'`)이 있는 job 을 건너뛴다
- `resend-dispatch` 는 job 의 스냅샷을 그대로 다시 보낸다. 스냅샷은 02:30 이후 갱신되지
  않으므로, 재발송을 눌러도 **추가된 품목이 빠진 옛 목록**이 나간다
- 로컬에는 Solapi 키가 없어 수동으로도 못 보낸다 (`project-dispatch-send-constraints`)

2026-08-01 에 03:05~03:26 사이 들어온 발주 13건이 이 상태였다. 인숙이네 4건,
신우상회 2종이 공급처에 전달되지 못해 사장님이 직접 문자를 보내야 했다.

## 설계

### 동작

`/admin/orders/dispatch/[date]` 의 공급처 카드에 `추가발주` 버튼을 둔다.
아래 세 조건을 모두 만족할 때만 보인다.

1. 02:30 발송이 끝난 공급처 (`dispatch_jobs.status='sent'`)
2. 그 발송에 포함되지 않은 발주 품목이 있음
3. 오늘 아직 추가발주를 보내지 않음

누르면 확인창을 거쳐 추가분만 발송하고, 이후 `추가발주 완료` 로 잠긴다.
하루 한 번만 보낸다(2026-08-01 결정). 발송에 실패하면 잠기지 않는다.

아직 발송 전인 공급처는 기존 `발송` 버튼이 처리하므로 이 버튼이 뜨지 않는다.
비활성 공급처는 지금처럼 `비활성 · 발송 제외` 만 표시한다.

### 추가분 판정

**현재 발주 품목 중 그 job 의 `dispatch_job_items` 에 행이 없는 것**이 추가분이다.
02:30 스냅샷이 기준선 역할을 하므로 별도 컬럼이 필요 없다.

발송에 성공하면 `syncDispatchJobItems` 로 그 품목들을 스냅샷에 넣는다.
이후 추가분이 0건이 되어 버튼이 사라진다.

### 문자

```
[추가발주]
2026-08-01

대파: 1ea
청경채: 2box
두부: 2pack (돈독푸드 1pack / 돈마나 1pack)
```

추가분만 보낸다. 총량을 같이 적으면 공급처가 총량만큼 더 가져올 위험이 있다.

기존 발송과 같은 `sendKakaoAlimtalk` 을 쓴다. 머리말이 등록 템플릿(`[발주내역]`)과
달라 알림톡이 거절되면 SMS 로 자동 대체된다. 실제 경로는 `dispatch_messages.channel`
에 기록된다. 지금도 발송분은 대부분 SMS 로 나가고 있어 실질적 차이는 없다.

### 데이터

`dispatch_messages.message_type` 추가 (`'dispatch' | 'additional'`, 기본 `'dispatch'`).
기존 행은 전부 `'dispatch'` 가 되어 영향이 없다. 이 값으로 "오늘 추가발주를 이미
보냈는지" 를 판정한다.

### 손대지 않는 것

- `resend-dispatch` 와 `재발송` 버튼 — 수량 정정용으로 정상 동작 중이다.
  추가 품목 문제는 새 버튼이 담당한다.
- `auto-dispatch` — 2026-08-01 02:30 정상 발송을 확인한 경로다.
- 명세서·정산 금액 — 발주 문자 계통만 바뀐다.

## 파일

| 파일 | 내용 |
|---|---|
| `supabase/migrations/20260801000000_add_dispatch_message_type.sql` | `message_type` 컬럼 |
| `apps/web/app/api/admin/orders/additional-dispatch/route.ts` | 추가분 산출 → 발송 → 기록 → 스냅샷 갱신 |
| `apps/web/app/admin/orders/dispatch/[date]/DispatchAdditionalButton.tsx` | 버튼 |
| `apps/web/app/admin/orders/dispatch/[date]/page.tsx` | 추가분 계산 + 버튼 배치 |

Cloudflare Worker 용량 제한에 세 번 걸린 이력이 있다. 새 라우트를 넣은 뒤 빌드 크기를
확인하고, 여유가 없으면 `resend-dispatch` 에 `mode` 파라미터로 합친다.

## 검증

저장소에 테스트 파일이 없다(vitest 만 설치). 기존 방식대로 확인한다.

1. 실제 데이터로 추가분 산출 결과를 스크립트로 대조 — 2026-08-01 기준
   인숙이네 4건(대파·고수·알배기·청경채), 신우상회 2종(두부 2pack, 재우 숙주 9box)
2. dev 서버에서 발주 내역 화면을 직접 확인
3. push 여부는 확인받고 진행
