export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { getAuthorizedAdminDb } from '@/lib/admin-member-user'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: periodId } = await params
    // 로그인만 봐서는 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
    const db = await getAuthorizedAdminDb()
    if (!db) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { error } = await db
      .from('settlement_periods')
      .update({ status: 'closed' })
      .eq('id', periodId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '오류' }, { status: 500 })
  }
}
