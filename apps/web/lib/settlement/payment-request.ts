/* eslint-disable @typescript-eslint/no-explicit-any */

import { sendKakaoAlimtalk } from '@/lib/messaging/kakao'
import { getCarryover } from '@/lib/settlement/carryover'

/**
 * 입금 요청 문자.
 *
 * 정산 확정 화면에서 「확정 · 발송완료」 된 정산서에 사장님이 버튼을 눌러 보낸다.
 * 명세서 발송(notify.ts)과 같은 길을 타되 문구와 금액이 다르다.
 *
 * **금액은 「지금 받아야 할 돈」이다** — 이 정산서의 남은 잔액 + 이전 미수금.
 * 청구 총액이 아니다. 일부 입금된 곳에 청구 총액을 요청하면 이미 낸 돈을 또 달라는 문자가 된다
 * (세류점 9/06~12 는 508,500 중 1,000 만 남아 있었다).
 * 정산 확정 화면의 「받을 금액」과 같은 숫자다.
 *
 * 계좌번호는 넣지 않는다 (사장님 결정, 2026-09-15).
 */

export function paymentRequestAmount(a: { outstanding: number; carryover: number }): number {
  return Math.max(0, Math.round(Number(a.outstanding ?? 0) + Number(a.carryover ?? 0)))
}

function isMobile(phone: string | null | undefined): boolean {
  if (!phone) return false
  return /^01\d{8,9}$/.test(phone.replace(/\D/g, ''))
}

/** 대표 연락처를 먼저, 휴대폰 번호만 쓴다. */
export function pickRequestPhone(contacts: Array<{ phone: string | null; is_primary: boolean | null }>): string | null {
  const sorted = [...contacts].sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)))
  return sorted.find(c => isMobile(c.phone))?.phone ?? null
}

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`

function periodLabel(start: string, end: string) {
  if (!start || !end) return ''
  const [sy, sm, sd] = start.split('-')
  const [, em, ed] = end.split('-')
  return `${sy}.${sm}.${sd} ~ ${em}.${ed}`
}

/**
 * 입금 요청 문구. 독촉이 아니라 **부탁**으로 읽혀야 한다 — 거래처와의 관계가 먼저다
 * (사장님 요청, 2026-09-15). 인사말로 시작하고, 이미 입금한 곳이 불쾌하지 않게 한 줄 둔다.
 */
export function buildPaymentRequestMessage(a: {
  orgName: string
  start: string
  end: string
  amount: number
  shareUrl: string
}): string {
  const period = periodLabel(a.start, a.end)
  return [
    '[FruitLife] 입금 요청 안내',
    '',
    `안녕하세요, ${a.orgName} 사장님.`,
    '항상 FruitLife를 이용해 주셔서 진심으로 감사드립니다.',
    '',
    period ? `${period} 정산 금액 안내드립니다.` : '정산 금액 안내드립니다.',
    '',
    `입금 요청액  ${won(a.amount)}`,
    '',
    '바쁘시겠지만 확인하시고 입금 부탁드리겠습니다.',
    '이미 입금해 주셨다면 이 문자는 넘겨주세요. 감사합니다.',
    '',
    `정산서 보기 ▸ ${a.shareUrl}`,
  ].join('\n')
}

export interface PaymentRequestDraft {
  ok: boolean
  error?: string
  orgName: string
  start: string
  end: string
  amount: number
  phone: string | null
}

/**
 * 보낼 내용을 만든다. 보내지는 않는다 — 확인창에 그대로 보여주기 위해서다.
 *
 * 이전 미수금은 getCarryover 하나로만 구한다. 정산 확정 화면·인쇄·명세서 발송 문자가
 * 모두 이 함수를 쓴다. 입금 요청 금액이 화면의 「받을 금액」과 다르면 안 된다.
 */
export async function draftPaymentRequest(db: any, statementId: string): Promise<PaymentRequestDraft> {
  const empty = { orgName: '', start: '', end: '', amount: 0, phone: null }

  const { data: stmt } = await db
    .from('sales_statements')
    .select('id, confirmed_at, restaurant_id, settlement_periods(start_date, end_date), restaurants(organization_id, organizations(name))')
    .eq('id', statementId)
    .maybeSingle()
  if (!stmt) return { ok: false, error: '정산서를 찾을 수 없습니다', ...empty }
  if (!stmt.confirmed_at) return { ok: false, error: '확정되지 않은 정산서입니다', ...empty }

  const rest = Array.isArray(stmt.restaurants) ? stmt.restaurants[0] : stmt.restaurants
  const org = Array.isArray(rest?.organizations) ? rest.organizations[0] : rest?.organizations
  const period = Array.isArray(stmt.settlement_periods) ? stmt.settlement_periods[0] : stmt.settlement_periods

  const { data: recvSelf } = await db
    .from('receivables').select('balance').eq('statement_id', statementId)
  const outstanding = (recvSelf ?? []).reduce((s: number, r: { balance: number }) => s + Number(r.balance ?? 0), 0)

  const { previous: carryover } = await getCarryover(
    db, stmt.restaurant_id, statementId, outstanding, period?.start_date ?? null)

  const { data: contacts } = await db
    .from('contacts').select('phone, is_primary').eq('organization_id', rest?.organization_id)

  const draft = {
    orgName: org?.name ?? '거래처',
    start: period?.start_date ?? '',
    end: period?.end_date ?? '',
    amount: paymentRequestAmount({ outstanding, carryover }),
    phone: pickRequestPhone(contacts ?? []),
  }
  if (draft.amount <= 0) return { ok: false, error: '받을 금액이 없습니다', ...draft }
  if (!draft.phone) return { ok: false, error: '휴대폰 연락처가 없습니다', ...draft }
  return { ok: true, ...draft }
}

/**
 * 실제로 보낸다. 알림톡 템플릿이 없거나 실패하면 sendKakaoAlimtalk 가 문자로 대체한다.
 *
 * 일정산 업체도 보낸다. 명세서 자동 발송이 일정산을 건너뛰는 건 매일 30통이 쌓여서인데,
 * 이건 사장님이 한 곳을 골라 누르는 버튼이라 그 이유가 해당하지 않는다.
 */
export async function sendPaymentRequest(draft: PaymentRequestDraft, shareUrl: string) {
  const text = buildPaymentRequestMessage({ ...draft, shareUrl })
  const res = await sendKakaoAlimtalk({
    receiverNum: draft.phone!,
    templateId: process.env.SOLAPI_PAYMENT_REQUEST_TEMPLATE_ID ?? '',
    templateBody: text,
    variables: {},
  })
  return { channel: res.channel, success: res.success, error: res.error }
}
