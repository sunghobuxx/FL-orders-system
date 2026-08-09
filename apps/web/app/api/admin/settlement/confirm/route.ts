export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { getAuthorizedAdminDb } from '@/lib/admin-member-user'
import { getSessionUser } from '@/lib/supabase/server'
import { notifyStatement } from '@/lib/settlement/notify'

/**
 * 정산서를 확정하고 통지한다.
 *
 * 확정은 세 가지를 한다 — 잠금, 기록, 발송.
 * **발송이 실패해도 확정은 유지한다.** 확정을 되돌리면 이미 넘긴 금액이 또 바뀔 수 있다.
 * 발송 실패는 notified_at 이 비어 있는 것으로 남고 재발송으로 처리한다.
 *
 * resend=true 면 이미 확정된 건에 발송만 다시 한다. 금액은 건드리지 않는다.
 */

const SHARE_DAYS = 7

/** 추측할 수 없는 링크 토큰. 명세서 내역이 담기므로 짧으면 안 된다. */
function makeToken() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(req: NextRequest) {
  try {
    const { statementIds, resend } = await req.json() as {
      statementIds?: string[]; resend?: boolean
    }
    if (!Array.isArray(statementIds) || statementIds.length === 0) {
      return NextResponse.json({ error: '확정할 정산서를 선택하세요' }, { status: 400 })
    }

    const db = await getAuthorizedAdminDb()
    if (!db) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user } = await getSessionUser()

    const origin = new URL(req.url).origin
    const results: Array<{
      statementId: string; confirmed: boolean; channel: string; success: boolean; error?: string
    }> = []

    for (const id of statementIds) {
      const { data: stmt } = await db
        .from('sales_statements')
        .select('id, total_amount, confirmed_at')
        .eq('id', id)
        .maybeSingle()
      if (!stmt) {
        results.push({ statementId: id, confirmed: false, channel: '-', success: false, error: '정산서 없음' })
        continue
      }

      // 확정 — 이미 확정된 건은 금액을 다시 쓰지 않는다
      if (!stmt.confirmed_at) {
        const { error } = await db.from('sales_statements').update({
          confirmed_at: new Date().toISOString(),
          confirmed_by: user?.id ?? null,
          confirmed_total: stmt.total_amount,
        }).eq('id', id)
        if (error) {
          results.push({ statementId: id, confirmed: false, channel: '-', success: false, error: error.message })
          continue
        }
      } else if (!resend) {
        results.push({ statementId: id, confirmed: true, channel: '-', success: false, error: '이미 확정됨' })
        continue
      }

      // 공유 링크 — 아직 안 지난 것이 있으면 다시 쓴다
      const now = new Date()
      const { data: live } = await db
        .from('statement_share_links')
        .select('token, expires_at')
        .eq('statement_id', id)
        .gt('expires_at', now.toISOString())
        .limit(1)
      let token: string = live?.[0]?.token ?? ''
      if (!token) {
        token = makeToken()
        const expires = new Date(now.getTime() + SHARE_DAYS * 86400_000).toISOString()
        const { error } = await db.from('statement_share_links')
          .insert({ token, statement_id: id, expires_at: expires })
        if (error) {
          results.push({ statementId: id, confirmed: true, channel: '-', success: false, error: `링크 발급 실패: ${error.message}` })
          continue
        }
      }

      const r = await notifyStatement(db, id, `${origin}/s/${token}`)
      if (r.success) {
        await db.from('sales_statements').update({ notified_at: new Date().toISOString() }).eq('id', id)
      }
      results.push({ statementId: id, confirmed: true, channel: r.channel, success: r.success, error: r.error })
    }

    return NextResponse.json({ results })
  } catch (e) {
    console.error('[POST /api/admin/settlement/confirm]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '확정 처리 중 오류가 발생했습니다' },
      { status: 500 },
    )
  }
}
