export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { getAdminSession } from '@/lib/admin-member-user'
import { getKstToday } from '@/lib/date-kst'
import { validDate } from '@/lib/member-settlement'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * 「오늘 단가 확정」 — 그 날짜의 단가 입력이 끝났음을 표시한다.
 *
 * 확정 시각은 DB 함수가 DB 시계(now())로 찍는다. 앱 서버 시계를 쓰면 price_snapshots.created_at
 * 과 순서가 어긋나 「수정됨」 판정이 틀어질 수 있다. 다시 누르면 시각이 갱신된다(수정됨 → 확정).
 * 미래 날짜는 확정할 수 없다(오늘까지).
 */
export async function POST(req: NextRequest) {
  // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  const body = await req.json().catch(() => null) as { date?: string } | null
  const date = body?.date
  if (!date || !validDate(date)) {
    return NextResponse.json({ error: '올바른 날짜를 선택해주세요' }, { status: 400 })
  }
  if (date > getKstToday()) {
    return NextResponse.json({ error: '오늘까지의 단가만 확정할 수 있습니다' }, { status: 400 })
  }

  // 데이터 작업은 service role 로 한다(새 표는 RLS 정책이 없다).
  const db = createAdminClient()
  const { data, error } = await db.rpc('confirm_price_day', { p_date: date, p_user: session.user.id })
  if (error) {
    console.error('[POST /api/admin/price-confirmations]', error)
    return NextResponse.json({ error: '확정에 실패했습니다' }, { status: 500 })
  }
  return NextResponse.json({ date, confirmedAt: data })
}
