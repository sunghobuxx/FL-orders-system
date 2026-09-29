export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-member-user'
import { normalizeDepositor } from '@/lib/payments/depositor'

/** 입금자 별칭 등록·삭제. 계좌 소유주 개인 이름으로 입금하는 업체가 많아 사장님이 직접 등록한다(2026-09-25 결정). */
export async function POST(req: Request) {
  try {
    const { restaurantId, alias } = await req.json() as { restaurantId?: string; alias?: string }
    if (!restaurantId || !alias?.trim()) return NextResponse.json({ error: '업체와 별칭을 입력하세요.' }, { status: 400 })

    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user, db } = session

    const aliasRaw = alias.trim()
    const aliasNorm = normalizeDepositor(aliasRaw)
    if (!aliasNorm) return NextResponse.json({ error: '별칭을 알아볼 수 없습니다. 다른 표기로 입력해 주세요.' }, { status: 400 })

    const { error } = await db
      .from('depositor_aliases')
      .insert({ restaurant_id: restaurantId, alias_raw: aliasRaw, alias_norm: aliasNorm, created_by: user.id })

    if (error) {
      if (error.code === '23505' || /duplicate key/.test(error.message ?? '')) {
        return NextResponse.json({ error: '이미 이 업체에 등록된 별칭입니다.' }, { status: 409 })
      }
      console.error('[aliases] insert error', error)
      return NextResponse.json({ error: '별칭 등록 실패' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[aliases] unexpected error', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json() as { id?: string }
    if (!id) return NextResponse.json({ error: '삭제할 별칭이 없습니다.' }, { status: 400 })

    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { db } = session

    const { error } = await db.from('depositor_aliases').delete().eq('id', id)
    if (error) {
      console.error('[aliases] delete error', error)
      return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[aliases] unexpected error', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
