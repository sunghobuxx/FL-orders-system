export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminSession } from '@/lib/admin-member-user'
import { getKstToday } from '@/lib/date-kst'
import { generateStatements } from '@/lib/settlement/generate'
import { checkIntegrity } from '@/lib/settlement/integrity'

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
      // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
      const session = await getAdminSession()
      if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
      const { user } = session
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

/**
 * 명세서 → 정산서 → 미수금 정합성 점검. 읽기만 한다.
 *
 * 라우트를 따로 두지 않고 여기 붙인 이유: Cloudflare Worker 3 MiB 한계에 걸려
 * 라우트를 하나 더 만들 여유가 없다.
 */
export async function GET(req: NextRequest) {
  try {
    // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user } = session

    const since = new URL(req.url).searchParams.get('since') ?? `${getKstToday().slice(0, 7)}-01`
    const result = await checkIntegrity(createAdminClient(), since)
    return NextResponse.json({ since, ...result })
  } catch (e) {
    console.error('[GET /api/admin/settlement/generate]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '점검 중 오류가 발생했습니다' }, { status: 500 })
  }
}
