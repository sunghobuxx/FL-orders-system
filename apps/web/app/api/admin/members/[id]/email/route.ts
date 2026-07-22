export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { getAuthorizedAdminDb, getOrganizationLoginUser } from '@/lib/admin-member-user'

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const db = await getAuthorizedAdminDb()
  if (!db) return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 })

  const { id: organizationId } = await context.params
  const { email } = await req.json() as { email?: string }
  const normalizedEmail = email?.trim().toLowerCase() ?? ''

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json({ error: '올바른 이메일 주소를 입력해주세요' }, { status: 400 })
  }

  const loginUser = await getOrganizationLoginUser(db, organizationId)
  if (!loginUser) {
    return NextResponse.json({ error: '이 업체의 로그인 계정을 찾을 수 없습니다' }, { status: 404 })
  }

  const { error: authError } = await db.auth.admin.updateUserById(loginUser.id, {
    email: normalizedEmail,
    email_confirm: true,
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

  const { error: userError } = await db
    .from('users')
    .update({ email: normalizedEmail })
    .eq('id', loginUser.id)
  if (userError) return NextResponse.json({ error: userError.message }, { status: 500 })

  return NextResponse.json({ success: true, email: normalizedEmail })
}
