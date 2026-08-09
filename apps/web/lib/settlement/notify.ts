/* eslint-disable @typescript-eslint/no-explicit-any */

import { sendKakaoAlimtalk } from '@/lib/messaging/kakao'

/**
 * 정산 확정 통지.
 *
 * 채널을 한 곳에서 정한다. 나중에 우선순위만 바꾸면 된다.
 * 알림톡은 템플릿이 없거나 실패하면 sendKakaoAlimtalk 안에서 문자로 자동 대체된다.
 * 그래서 템플릿 승인 전에는 문자로 나가다가 승인일에 ID 만 넣으면 알림톡이 된다.
 */

export type Cycle = 'daily' | 'weekly' | 'monthly'
export type Channel = 'push' | 'kakao' | 'sms' | 'skip-daily' | 'no-contact'

export interface NotifyTarget {
  cycle: Cycle
  phone: string | null
  pushToken: string | null
}

/** 휴대폰 번호로 쓸 수 있는 형태인지. 하이픈은 걷어내고 본다. */
function isMobile(phone: string | null): boolean {
  if (!phone) return false
  return /^01\d{8,9}$/.test(phone.replace(/\D/g, ''))
}

export function pickChannel(t: NotifyTarget): Channel {
  // 일정산은 매일 보내면 월 30통이라 문자로는 감당이 안 된다.
  // 푸시가 열리는 단계에서 포함한다.
  if (t.cycle === 'daily') return 'skip-daily'
  if (t.pushToken) return 'push'
  if (isMobile(t.phone)) return 'kakao'
  return 'no-contact'
}

export interface MessageArgs {
  orgName: string
  start: string
  end: string
  current: number
  carryover: number
  total: number
  shareUrl: string
}

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`

/** "2026-08-02", "2026-08-08" → "2026.08.02 ~ 08.08" */
function periodLabel(start: string, end: string) {
  const [sy, sm, sd] = start.split('-')
  const [, em, ed] = end.split('-')
  return `${sy}.${sm}.${sd} ~ ${em}.${ed}`
}

export function buildMessage(a: MessageArgs): string {
  return [
    '[FruitLife] 정산 안내',
    '',
    a.orgName,
    periodLabel(a.start, a.end),
    '',
    `당기 청구   ${won(a.current)}`,
    `이전 미수금 ${won(a.carryover)}`,
    '─────────────────',
    `총 청구액   ${won(a.total)}`,
    '',
    `정산서 보기 ▸ ${a.shareUrl}`,
  ].join('\n')
}

export interface NotifyResult {
  channel: Channel
  success: boolean
  error?: string
}

/**
 * 한 정산서를 통지한다. 실패해도 확정은 되돌리지 않는다 —
 * 확정을 되돌리면 이미 넘긴 금액이 또 바뀔 수 있다.
 */
export async function notifyStatement(
  db: any,
  statementId: string,
  shareUrl: string,
): Promise<NotifyResult> {
  const { data: stmt } = await db
    .from('sales_statements')
    .select('id, total_amount, restaurant_id, settlement_periods(start_date, end_date), restaurants(settlement_cycle, organization_id, organizations(name))')
    .eq('id', statementId)
    .maybeSingle()
  if (!stmt) return { channel: 'no-contact', success: false, error: '정산서를 찾을 수 없습니다' }

  const rest = Array.isArray(stmt.restaurants) ? stmt.restaurants[0] : stmt.restaurants
  const org = Array.isArray(rest?.organizations) ? rest.organizations[0] : rest?.organizations
  const period = Array.isArray(stmt.settlement_periods) ? stmt.settlement_periods[0] : stmt.settlement_periods
  const cycle = (rest?.settlement_cycle ?? 'weekly') as Cycle

  const { data: contacts } = await db
    .from('contacts')
    .select('phone, is_primary')
    .eq('organization_id', rest?.organization_id)
  const sorted = (contacts ?? []).sort(
    (a: { is_primary: boolean }, b: { is_primary: boolean }) => Number(b.is_primary) - Number(a.is_primary))
  const phone: string | null = sorted.find((c: { phone: string }) => isMobile(c.phone))?.phone ?? null

  const { data: pushRows } = await db
    .from('memberships')
    .select('push_token')
    .eq('organization_id', rest?.organization_id)
    .not('push_token', 'is', null)
    .limit(1)
  const pushToken: string | null = pushRows?.[0]?.push_token ?? null

  const channel = pickChannel({ cycle, phone, pushToken })
  if (channel === 'skip-daily') return { channel, success: false, error: '일정산은 발송 대상이 아닙니다' }
  if (channel === 'no-contact') return { channel, success: false, error: '연락처가 없습니다' }
  if (channel === 'push') {
    // 이번 범위에서는 만들지 않는다. 토큰이 있는 업체가 생기면 여기를 채운다.
    return { channel, success: false, error: '푸시는 아직 구현하지 않았습니다' }
  }

  // 이전 미수금 = 이 정산서를 뺀 나머지 미수금 합
  const { data: others } = await db
    .from('receivables')
    .select('balance, statement_id')
    .eq('restaurant_id', stmt.restaurant_id)
  const carryover = (others ?? [])
    .filter((r: { statement_id: string }) => r.statement_id !== statementId)
    .reduce((s: number, r: { balance: number }) => s + Number(r.balance ?? 0), 0)

  const current = Number(stmt.total_amount ?? 0)
  const text = buildMessage({
    orgName: org?.name ?? '거래처',
    start: period?.start_date ?? '',
    end: period?.end_date ?? '',
    current, carryover, total: current + carryover,
    shareUrl,
  })

  const res = await sendKakaoAlimtalk({
    receiverNum: phone!,
    templateId: process.env.SOLAPI_SETTLEMENT_TEMPLATE_ID ?? '',
    templateBody: text,
    variables: {},
  })

  return { channel: res.channel, success: res.success, error: res.error }
}
