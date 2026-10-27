/* eslint-disable @typescript-eslint/no-explicit-any */

import { sendSms } from '@/lib/messaging/kakao'

/**
 * 당일명세서 문자 발송.
 *
 * 정산서(lib/settlement/notify.ts)와 같은 패턴 — 회원정보(contacts)에 등록된
 * 휴대폰번호로, 로그인 없이 여는 공유 링크를 문자로 보낸다. 명세서는 정산서와 달리
 * 알림톡 템플릿 승인을 받아 둔 게 없으므로 바로 SMS 로 보낸다.
 */

/** 휴대폰 번호로 쓸 수 있는 형태인지. 하이픈은 걷어내고 본다. */
function isMobile(phone: string | null): boolean {
  if (!phone) return false
  return /^01\d{8,9}$/.test(phone.replace(/\D/g, ''))
}

export interface SpecNotifyResult {
  success: boolean
  error?: string
}

/** "2026-10-27" → "2026.10.27" */
function dateLabel(businessDate: string) {
  const [y, m, d] = businessDate.split('-')
  return `${y}.${m}.${d}`
}

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`

export function buildSpecMessage(args: {
  orgName: string
  businessDate: string
  itemCount: number
  totalAmount: number
  shareUrl: string
}): string {
  return [
    '[FruitLife] 당일 명세서',
    '',
    args.orgName,
    dateLabel(args.businessDate),
    '',
    `품목 ${args.itemCount}건, 합계 ${won(args.totalAmount)}`,
    '',
    `명세서 보기 ▸ ${args.shareUrl}`,
    '',
    '* 위 링크는 7일간만 열립니다. 이후에도 명세서가 필요하시면',
    '  010-8680-5475 로 연락 주세요 — 출력해서 보내드립니다.',
  ].join('\n')
}

/**
 * 한 당일명세서를 문자로 보낸다.
 *
 * 연락처는 정산서와 같은 곳(contacts, is_primary 우선)에서 가져온다 —
 * 회원정보 화면(admin/members/[id])이 쓰는 번호와 같아야 한다.
 */
export async function notifySpec(db: any, specId: string, shareUrl: string): Promise<SpecNotifyResult> {
  const { data: spec } = await db
    .from('daily_specs')
    .select('id, business_date, total_amount, restaurant_id, restaurants(organization_id, organizations(name))')
    .eq('id', specId)
    .maybeSingle()
  if (!spec) return { success: false, error: '명세서를 찾을 수 없습니다' }

  const rest = Array.isArray(spec.restaurants) ? spec.restaurants[0] : spec.restaurants
  const org = Array.isArray(rest?.organizations) ? rest.organizations[0] : rest?.organizations
  if (!rest?.organization_id) return { success: false, error: '업체 정보를 확인할 수 없습니다' }

  const { data: contacts } = await db
    .from('contacts')
    .select('phone, is_primary')
    .eq('organization_id', rest.organization_id)
  const sorted = (contacts ?? []).sort(
    (a: { is_primary: boolean }, b: { is_primary: boolean }) => Number(b.is_primary) - Number(a.is_primary))
  const phone: string | null = sorted.find((c: { phone: string }) => isMobile(c.phone))?.phone ?? null
  if (!phone) return { success: false, error: '등록된 휴대폰번호가 없습니다' }

  const { count: itemCount } = await db
    .from('daily_spec_lines')
    .select('id', { count: 'exact', head: true })
    .eq('daily_spec_id', specId)

  const text = buildSpecMessage({
    orgName: org?.name ?? '거래처',
    businessDate: spec.business_date,
    itemCount: itemCount ?? 0,
    totalAmount: Number(spec.total_amount ?? 0),
    shareUrl,
  })

  const res = await sendSms(phone, text)
  return { success: res.success, error: res.error }
}
