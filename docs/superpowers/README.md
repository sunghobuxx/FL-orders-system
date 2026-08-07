# superpowers 스킬 사용 안내

새 작업을 시작할 때 어떤 순서로 무엇을 쓸지 정리한 문서다.
`docs/superpowers/specs/` 에 설계가, `plans/` 에 구현 계획이 쌓인다.

스킬은 `superpowers:<이름>` 으로 부른다. `/superpowers` 단독 명령은 없다.

---

## 본줄기 — 새 기능을 만들 때

```
brainstorming        설계·스펙        specs/ 에 문서 커밋
      ↓
writing-plans        구현 계획        plans/ 에 작업 단위로
      ↓
using-git-worktrees  격리 작업공간     (선택)
      ↓
executing-plans      실행             또는 subagent-driven-development
      ↓
finishing-a-development-branch        병합 / PR / 보존
```

각 스킬이 실제로 다음을 가리키고 있어 한 줄기로 이어진다.
`brainstorming` 은 **오직** `writing-plans` 로만 넘어간다. 다른 스킬을 부르지 않는다.

### brainstorming

아이디어를 설계로 다듬는다. 질문을 하나씩 던져 목적·제약·성공 기준을 잡고,
접근 2~3가지를 비교한 뒤 설계 문서를 남긴다.

**코드를 못 쓴다.** 설계를 제시하고 승인받기 전에는 구현·파일 생성이 막혀 있다.
작은 수정에는 과하다. **만들 것의 모양이 아직 안 잡혔을 때** 쓴다.

### writing-plans

설계를 작업 단위로 쪼갠다. 여기서 갈림길이 나온다.

| 실행 방식 | 언제 |
|---|---|
| `executing-plans` | 다른 세션에서 하나씩. 중간에 검토 지점. **신중한 작업** |
| `subagent-driven-development` | 이 세션에서 나눠 맡김. 빠름. **작업이 서로 독립일 때** |

`subagent-driven-development` 는 끝에 `requesting-code-review` 를 부른다.

---

## 곁가지 — 상황이 오면 부른다

본줄기 어디서든 끼어든다.

| 스킬 | 언제 |
|---|---|
| `systematic-debugging` | 버그·테스트 실패. **증상만 고치는 것을 막는다** |
| `test-driven-development` | 구현 코드를 쓰기 직전 |
| `verification-before-completion` | "다 됐다" 라고 말하기 직전 |
| `requesting-code-review` → `receiving-code-review` | 리뷰를 주고받을 때 |
| `dispatching-parallel-agents` | 독립 작업이 여럿일 때 |
| `writing-skills` | 스킬 자체를 만들거나 고칠 때 |
| `using-superpowers` | 규칙 자체. 세션 시작 시 자동으로 읽힌다 |

`verification-before-completion` 은 어느 스킬도 자동으로 부르지 않는다.
**말하기 전에 스스로 거는 브레이크**다.

---

## 이 프로젝트에서 실제로 쓸 것

혼자 쓰는 운영 시스템이고 배포가 main 단선이라, 전체 절차를 다 태우면 과하다.

### 값을 하는 것

**`systematic-debugging`** — 버그가 났을 때. 화면·문자·명세서가 얽혀 있어
증상만 보면 엉뚱한 데를 고치게 된다.

> 2026-07-30 발주 문자 수량 문제. "화면은 고쳐지는데 문자는 안 바뀐다" 에서
> `syncDispatchJobItems` 가 발송 직전 수량을 덮어쓰는 것을 찾아냈다.

**`brainstorming` → `writing-plans`** — 범위가 넓거나 돈이 걸린 작업.

> 2026-07-30 정산 정합성 작업은 계획 없이 들어가서 검사 기준을 두 번 잘못 잡았다
> (발주까지 맞추려 했으나 **발주 ≠ 명세서는 정상**이 규칙이었다).
> 중간에 홍박아구찜 정산서 중복도 만들었다. 계획을 먼저 세웠어야 했다.

**`verification-before-completion`** — 완료를 주장하기 전.
운영에서 실제로 눌러 보고 말한다.

### 건너뛰어도 되는 것

`using-git-worktrees` · `dispatching-parallel-agents` ·
`subagent-driven-development` — 혼자 작업하고 배포가 단선이라 격리·병렬의 이득이 적다.

`finishing-a-development-branch` 는 브랜치를 쌓아 쓸 때만.

---

## 예시 — 거래원장을 어드민에 넣는다면

```
brainstorming    어느 화면 · 기간 선택 방식 · 미청구 표시 · 인쇄/엑셀 여부
      ↓          → specs/YYYY-MM-DD-거래원장-design.md
writing-plans    조회 로직 / 화면 / 인쇄 로 쪼갬
      ↓          → plans/YYYY-MM-DD-거래원장.md
executing-plans  하나씩 실행, 단계마다 확인
      ↓
verification-before-completion   운영에서 실제로 눌러 확인
      ↓
배포 (main push → CF 자동배포)
```

---

## 이 프로젝트의 고정 규칙

스킬과 별개로 항상 지킬 것. 스킬보다 **사용자 지시가 우선**이다.

- **배포는 확인받고 한다.** GitHub push → CF 자동배포만 쓴다. CF 직접 배포 금지
- **발주 문자는 02:30 자동발송만.** 임의 수동 발송 금지 (수량 정정 재발송은 예외)
- **작동 확인된 코드는 건드리지 않는다.** `member/` 디렉토리는 특히
- **수정 전 `memory/` 를 먼저 본다.** 운영 정책·과거 사고가 쌓여 있다
- **완납된 정산서는 소급 청구하지 않는다**
- **발주 ≠ 명세서는 정상.** 맞춰야 하는 것은 명세서 = 정산서 = 미수금
