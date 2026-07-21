export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/messaging/kakao'
import { getSessionUser } from '@/lib/supabase/server'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { user } = await getSessionUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const adminDb = createAdminClient()
  const { data: membership } = await adminDb
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership || !['admin', 'manager'].includes(membership.role)) {
    return NextResponse.json({ error: '문자 발송 권한이 없습니다' }, { status: 403 })
  }

  // 공지 조회
  const { data: notice, error: noticeErr } = await adminDb
    .from('notices')
    .select('id, title, body')
    .eq('id', id)
    .single()

  if (noticeErr || !notice) {
    return NextResponse.json({ error: '공지를 찾을 수 없습니다' }, { status: 404 })
  }

  // 매출업체 전화번호 조회
  const { data: orgs } = await adminDb
    .from('organizations')
    .select('id, name')
    .eq('organization_type', 'restaurant')
    .eq('status', 'active')

  const orgIds = orgs?.map(o => o.id) ?? []

  const { data: contacts } = await adminDb
    .from('contacts')
    .select('organization_id, name, phone, is_primary')
    .in('organization_id', orgIds)
    .not('phone', 'is', null)
    .neq('phone', '')

  // 업체당 1건: 대표번호를 우선하고, 없으면 등록된 다른 유효번호를 사용한다.
  const targetByOrg = new Map<string, { organization_id: string; name: string | null; phone: string; is_primary: boolean }>()
  for (const contact of contacts ?? []) {
    const phone = contact.phone?.replace(/\D/g, '') ?? ''
    if (!/^01\d{8,9}$/.test(phone)) continue
    const existing = targetByOrg.get(contact.organization_id)
    if (!existing || contact.is_primary) {
      targetByOrg.set(contact.organization_id, { ...contact, phone })
    }
  }
  const targets = [...targetByOrg.values()]

  if (targets.length === 0) {
    return NextResponse.json({ error: '발송 가능한 전화번호가 없습니다' }, { status: 400 })
  }

  // SMS 본문
  const text = `[프루트라이프]\n${notice.title}\n\n${notice.body}`

  // 순차 발송 (Solapi rate limit 고려)
  const results: { org: string; phone: string; success: boolean; error?: string }[] = []

  for (const contact of targets) {
    const org = orgs?.find(o => o.id === contact.organization_id)
    const result = await sendSms(contact.phone, text)
    results.push({
      org: org?.name ?? contact.organization_id,
      phone: contact.phone,
      success: result.success,
      error: result.error,
    })
  }

  const successCount = results.filter(r => r.success).length
  const failCount = results.length - successCount

  return NextResponse.json({ successCount, failCount, results })
}
