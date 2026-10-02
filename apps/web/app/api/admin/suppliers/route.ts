export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminSession } from '@/lib/admin-member-user'

export async function POST(req: NextRequest) {
  try {
    const { name, dispatch_channel, phone } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: '공급처명을 입력하세요' }, { status: 400 })

    // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user } = session
    // 데이터 작업은 service role 로 한다. 세션(RLS)으로 쓰면 막혀도 에러가 안 나
    // 조용히 실패하거나 조회가 null 이 되어 엉뚱한 404 가 난다.
    const db = createAdminClient()

    // 회원(식당) 등록 라우트와 같은 방식 — organizations 에 직접 insert 한다.
    // 전에는 admin_create_organization 이라는 DB 함수를 불렀는데, 그 함수가 운영 DB 에
    // 없어서 공급처 등록이 늘 500 으로 실패하고 있었다(2026-10-02 가락시장 등록 중 발견).
    const { data: org, error: orgErr } = await db
      .from('organizations')
      .insert({ name: name.trim(), organization_type: 'supplier', status: 'active' })
      .select('id')
      .single()
    if (orgErr || !org) {
      console.error('[POST /api/admin/suppliers]', orgErr)
      return NextResponse.json({ error: '공급처 등록 실패' }, { status: 500 })
    }
    const orgId = org.id as string

    const { data: sup } = await db.from('suppliers')
      .insert({ organization_id: orgId, dispatch_channel: dispatch_channel || 'kakao', status: 'active' })
      .select('id').single()

    if (phone && sup) {
      await db.from('contacts').insert({
        organization_id: orgId,
        name: name.trim(),
        phone,
        channel_type: 'kakao',
        is_primary: true,
      })
    }

    return NextResponse.json({ success: true, supplierId: sup?.id })
  } catch (e) {
    console.error('[POST /api/admin/suppliers] unexpected', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
