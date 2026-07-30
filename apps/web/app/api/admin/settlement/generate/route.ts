export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'
import { getKstToday } from '@/lib/date-kst'
import { generateStatements } from '@/lib/settlement/generate'

const CRON_SECRET = process.env.PUSH_CRON_SECRET

/**
 * 정산서 자동 생성.
 *
 * 호출 경로 두 가지
 *  - 크론: Authorization: Bearer <PUSH_CRON_SECRET>
 *  - 어드민 화면: 로그인 세션
 *
 * 금액(청구·미수금)을 만드는 작업이라 인증 없이 열어두지 않는다.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('Authorization')
    const isCron = Boolean(CRON_SECRET) && auth === `Bearer ${CRON_SECRET}`

    if (!isCron) {
      const { user } = await getSessionUser()
      if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({})) as {
      businessDate?: string
      force?: boolean
      restaurantIds?: string[]
    }
    const businessDate = body.businessDate ?? getKstToday()

    const db = createAdminClient()
    const result = await generateStatements(db, businessDate, {
      force: body.force === true,
      restaurantIds: body.restaurantIds,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    console.error('[POST /api/admin/settlement/generate]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '정산서 생성 중 오류가 발생했습니다' },
      { status: 500 },
    )
  }
}
