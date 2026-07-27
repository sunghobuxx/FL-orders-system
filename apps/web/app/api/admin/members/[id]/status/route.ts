export const runtime = 'edge'

import { type NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

/**
 * 회원(조직) 활성/비활성 전환.
 * 비활성으로 두면 목록에서 숨겨지고, 거래 이력은 그대로 남는다.
 * 조직과 그에 딸린 restaurants/suppliers 상태를 함께 맞춘다.
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: orgId } = await context.params
    const { status } = await req.json() as { status?: string }
    if (status !== 'active' && status !== 'inactive') {
      return NextResponse.json({ error: "status 는 'active' 또는 'inactive' 여야 합니다" }, { status: 400 })
    }

    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

    const db = createAdminClient()

    const { data: updated, error } = await db
      .from('organizations').update({ status }).eq('id', orgId).select('id, name')
    if (error) {
      console.error('[PATCH /api/admin/members/[id]/status]', error)
      return NextResponse.json({ error: `상태 변경 실패: ${error.message}` }, { status: 500 })
    }
    if (!updated?.length) {
      return NextResponse.json({ error: '업체를 찾을 수 없습니다' }, { status: 404 })
    }

    await Promise.all([
      db.from('restaurants').update({ status }).eq('organization_id', orgId),
      db.from('suppliers').update({ status }).eq('organization_id', orgId),
    ])

    return NextResponse.json({ success: true, status, name: updated[0].name })
  } catch (e) {
    console.error('[PATCH /api/admin/members/[id]/status] unexpected', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
