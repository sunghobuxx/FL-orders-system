export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { getAuthorizedAdminDb, getOrganizationLoginUser } from '@/lib/admin-member-user'

export async function POST(req: NextRequest) {
  const db = await getAuthorizedAdminDb()
  if (!db) return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 })

  const { orgId } = await req.json() as { orgId?: string }
  if (!orgId) return NextResponse.json({ error: '업체 정보가 필요합니다' }, { status: 400 })

  const loginUser = await getOrganizationLoginUser(db, orgId)
  if (!loginUser) {
    return NextResponse.json({ error: '이 업체의 로그인 계정을 찾을 수 없습니다' }, { status: 404 })
  }

  const { data, error } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: loginUser.email,
  })
  if (error || !data.properties?.hashed_token) {
    return NextResponse.json({ error: error?.message ?? '로그인 링크 발급에 실패했습니다' }, { status: 400 })
  }

  if (data.user.id !== loginUser.id) {
    return NextResponse.json({ error: '업체 로그인 계정이 일치하지 않습니다' }, { status: 409 })
  }

  return NextResponse.json({ tokenHash: data.properties.hashed_token })
}
