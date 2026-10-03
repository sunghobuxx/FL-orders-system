export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminSession } from '@/lib/admin-member-user'
import { sendSms } from '@/lib/messaging/kakao'

const CRON_SECRET = process.env.PUSH_CRON_SECRET

/**
 * 특정 업체 목록에만 보내는 문자. 공지사항(/api/admin/notices/[id]/send-sms)은 전체
 * 매출업체에 발송하는데, 품절·배송지연처럼 일부 업체에만 알릴 일도 있어 따로 둔다.
 * 사람은 로그인 세션으로, 운영 스크립트는 Authorization: Bearer <PUSH_CRON_SECRET>로 부른다.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('Authorization')
    const isCron = Boolean(CRON_SECRET) && auth === `Bearer ${CRON_SECRET}`
    if (!isCron) {
      const session = await getAdminSession()
      if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    }

    const { organizationIds, message } = await req.json() as { organizationIds?: string[]; message?: string }
    if (!organizationIds?.length) return NextResponse.json({ error: '보낼 업체를 선택하세요' }, { status: 400 })
    if (!message?.trim()) return NextResponse.json({ error: '메시지를 입력하세요' }, { status: 400 })

    const db = createAdminClient()
    const { data: orgs } = await db.from('organizations').select('id, name').in('id', organizationIds)
    const { data: contacts } = await db
      .from('contacts')
      .select('organization_id, phone, is_primary')
      .in('organization_id', organizationIds)
      .not('phone', 'is', null)
      .neq('phone', '')

    // 업체당 1건: 대표번호를 우선하고, 없으면 등록된 다른 유효번호를 쓴다.
    const targetByOrg = new Map<string, string>()
    for (const c of (contacts ?? []) as { organization_id: string; phone: string; is_primary: boolean }[]) {
      const phone = c.phone?.replace(/\D/g, '') ?? ''
      if (!/^01\d{8,9}$/.test(phone)) continue
      if (!targetByOrg.has(c.organization_id) || c.is_primary) targetByOrg.set(c.organization_id, phone)
    }

    const results: { org: string; phone: string; success: boolean; error?: string }[] = []
    for (const [orgId, phone] of targetByOrg) {
      const org = (orgs ?? []).find((o: { id: string; name: string }) => o.id === orgId)
      const result = await sendSms(phone, message)
      results.push({ org: org?.name ?? orgId, phone, success: result.success, error: result.error })
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.length - successCount
    return NextResponse.json({ successCount, failCount, results })
  } catch (e) {
    console.error('[POST /api/admin/restaurants/notify]', e)
    return NextResponse.json({ error: '처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
