export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-member-user'
import { searchKakaoAddress } from '@/lib/kakao-local'

export async function GET(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

    const q = new URL(req.url).searchParams.get('q')?.trim()
    if (!q) return NextResponse.json({ error: '검색어를 입력하세요' }, { status: 400 })

    const candidates = await searchKakaoAddress(q)
    return NextResponse.json({ candidates })
  } catch (e) {
    console.error('[GET /api/admin/members/address-search]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : '검색 실패' }, { status: 500 })
  }
}
