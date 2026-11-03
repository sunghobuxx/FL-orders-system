export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { getAuthorizedAdminDb } from '@/lib/admin-member-user'
import { getSessionUser } from '@/lib/supabase/server'

/**
 * 회원이 올린 품목 요청을 승인하거나 거절한다.
 *
 * 단가 없이도 승인한다(2026-11-03, 사장님 요청) — 단가는 품목마스터에서 나중에
 * 등록해도 된다. 단가 미등록 상태로 발주가 들어오면 명세서가 0원으로 나갈 수
 * 있으니(2026-08-09 일회용 손장갑 사고), 승인 후 단가 등록을 챙겨야 한다.
 * 승인은 restaurant_products 에 added_by='member' 로 넣는다 — 회원이 원해서 열린
 * 품목이므로 회원이 뺄 수 있어야 한다.
 */

export async function POST(req: NextRequest) {
  try {
    const { requestId, action } = await req.json() as {
      requestId?: string; action?: 'approve' | 'reject'
    }
    if (!requestId || (action !== 'approve' && action !== 'reject')) {
      return NextResponse.json({ error: '요청 정보가 올바르지 않습니다' }, { status: 400 })
    }

    const db = await getAuthorizedAdminDb()
    if (!db) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user } = await getSessionUser()

    const { data: reqRow } = await db
      .from('product_requests')
      .select('id, restaurant_id, product_id, status')
      .eq('id', requestId)
      .maybeSingle()
    if (!reqRow) return NextResponse.json({ error: '요청을 찾을 수 없습니다' }, { status: 404 })
    if (reqRow.status !== 'pending') {
      return NextResponse.json({ error: '이미 처리된 요청입니다' }, { status: 409 })
    }

    if (action === 'approve') {
      // 이미 열려 있으면 그건 실패가 아니다. UNIQUE(restaurant_id, product_id) 로 죽지 않게 먼저 본다.
      const { data: already } = await db
        .from('restaurant_products').select('id')
        .eq('restaurant_id', reqRow.restaurant_id).eq('product_id', reqRow.product_id).maybeSingle()

      if (!already) {
        const { error } = await db.from('restaurant_products').insert({
          restaurant_id: reqRow.restaurant_id,
          product_id: reqRow.product_id,
          added_by: 'member',
          added_by_user: user?.id ?? null,
        })
        if (error) {
          return NextResponse.json({ error: `품목 추가 실패: ${error.message}` }, { status: 500 })
        }
      }
    }

    const { error: updErr } = await db.from('product_requests').update({
      status: action === 'approve' ? 'approved' : 'rejected',
      decided_at: new Date().toISOString(),
      decided_by: user?.id ?? null,
    }).eq('id', requestId)
    if (updErr) return NextResponse.json({ error: `상태 변경 실패: ${updErr.message}` }, { status: 500 })

    return NextResponse.json({ success: true, action })
  } catch (e) {
    console.error('[POST /api/admin/products/requests]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '처리 중 오류가 발생했습니다' },
      { status: 500 })
  }
}
