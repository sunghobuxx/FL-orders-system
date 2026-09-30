export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getAuthorizedAdminDb } from '@/lib/admin-member-user'

const PHONE_RE = /^[+0-9()\s-]+$/

/**
 * 관리자 계정(매니저·오너)의 전화번호 입력. /api/member/delivery-contact 가 이 값을
 * 회원 발주확인 화면(모바일)의 배송 담당자 연락처로 그대로 불러온다(2026-09-30).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params
  const { phone } = await req.json() as { phone?: string }

  // 로그인만 봐서는 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
  const db = await getAuthorizedAdminDb()
  if (!db) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  const trimmed = phone?.trim() ?? ''
  if (trimmed && !PHONE_RE.test(trimmed)) {
    return NextResponse.json({ error: '전화번호 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { error } = await db.from('users').update({ phone: trimmed || null }).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
