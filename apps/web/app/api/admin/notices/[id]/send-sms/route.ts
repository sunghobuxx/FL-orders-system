export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/messaging/kakao'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const adminDb = createAdminClient()

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
    .select('organization_id, name, phone')
    .in('organization_id', orgIds)
    .eq('is_primary', true)
    .not('phone', 'is', null)
    .neq('phone', '')

  const targets = (contacts ?? []).filter(c => c.phone && c.phone.length >= 10)

  if (targets.length === 0) {
    return NextResponse.json({ error: '발송 가능한 전화번호가 없습니다' }, { status: 400 })
  }

  // SMS 본문
  const text = `[프루트라이프]\n${notice.title}\n\n${notice.body}`

  // 순차 발송 (Solapi rate limit 고려)
  const results: { org: string; phone: string; success: boolean; error?: string }[] = []

  for (const contact of targets) {
    const org = orgs?.find(o => o.id === contact.organization_id)
    // 전화번호 정규화 (하이픈 제거)
    const phone = contact.phone.replace(/-/g, '')
    const result = await sendSms(phone, text)
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
