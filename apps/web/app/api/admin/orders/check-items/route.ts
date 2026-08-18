export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminSession } from '@/lib/admin-member-user'
import { applyCheckStage } from '@/lib/orders/check-stage'

/**
 * 발주 품목 확인 체크 (어드민).
 * 계산은 lib/orders/check-stage 에 있다. 배송앱도 같은 함수를 쓴다.
 */
export async function POST(req: NextRequest) {
  try {
    const { itemIds, stage } = await req.json() as { itemIds?: string[]; stage?: number }
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json({ error: '품목이 없습니다' }, { status: 400 })
    }
    if (![0, 1, 2].includes(Number(stage))) {
      return NextResponse.json({ error: '확인 단계가 올바르지 않습니다' }, { status: 400 })
    }

    // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

    const result = await applyCheckStage(createAdminClient(), itemIds, Number(stage))
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    console.error('[POST /api/admin/orders/check-items]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '확인 처리 중 오류가 발생했습니다' },
      { status: 500 },
    )
  }
}
