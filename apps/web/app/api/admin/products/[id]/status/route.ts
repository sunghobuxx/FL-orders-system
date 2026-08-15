export const runtime = 'edge'

import { type NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminSession } from '@/lib/admin-member-user'

/**
 * 품목 활성/비활성 전환.
 * 기존 PATCH 는 품목명·분류·단위를 전부 받아야 해서 상태만 바꾸기엔 무겁다.
 * 비활성 품목은 목록에서 숨겨지고, 발주·명세서 이력은 그대로 남는다.
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const { status } = await req.json() as { status?: string }
    if (status !== 'active' && status !== 'inactive') {
      return NextResponse.json({ error: "status 는 'active' 또는 'inactive' 여야 합니다" }, { status: 400 })
    }

    // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user } = session

    const db = createAdminClient()
    const { data: updated, error } = await db
      .from('products').update({ status }).eq('id', id).select('id, standard_name')

    if (error) {
      console.error('[PATCH /api/admin/products/[id]/status]', error)
      return NextResponse.json({ error: `상태 변경 실패: ${error.message}` }, { status: 500 })
    }
    if (!updated?.length) {
      return NextResponse.json({ error: '품목을 찾을 수 없습니다' }, { status: 404 })
    }

    return NextResponse.json({ success: true, status, name: updated[0].standard_name })
  } catch (e) {
    console.error('[PATCH /api/admin/products/[id]/status] unexpected', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
