export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { getAuthorizedAdminDb } from '@/lib/admin-member-user'

export async function POST(req: Request) {
  try {
    const { period_type, start_date, end_date } = await req.json() as {
      period_type: string
      start_date: string
      end_date: string
    }
    if (!period_type || !start_date || !end_date) {
      return NextResponse.json({ error: '필드 누락' }, { status: 400 })
    }
    // 로그인만 봐서는 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
    const db = await getAuthorizedAdminDb()
    if (!db) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { data, error } = await db
      .from('settlement_periods')
      .insert({ period_type, start_date, end_date, status: 'open' })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ id: data.id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '오류' }, { status: 500 })
  }
}
