export const runtime = 'edge'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server'

import { getAuthorizedAdminDb } from '@/lib/admin-member-user'
import { buildPaymentRequestMessage, draftPaymentRequest, sendPaymentRequest } from '@/lib/settlement/payment-request'

/**
 * 입금 요청 문자.
 *
 * send 가 없으면 **미리보기만** 돌려준다 — 화면이 확인창에 실제 보낼 문구를 그대로 띄운다.
 * send=true 일 때만 보내고, 성공하면 payment_requested_at 을 남긴다.
 */

const SHARE_DAYS = 7

/** 정산서 공유 링크. 명세서 발송(confirm 라우트)과 같은 규칙 — 안 지난 링크가 있으면 다시 쓴다. */
async function getOrCreateShareLink(db: any, statementId: string): Promise<string | null> {
  const now = new Date()
  const { data: live } = await db
    .from('statement_share_links').select('token')
    .eq('statement_id', statementId).gt('expires_at', now.toISOString()).limit(1)
  if (live?.[0]?.token) return live[0].token

  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const token = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
  const expires = new Date(now.getTime() + SHARE_DAYS * 86400_000).toISOString()
  const { error } = await db.from('statement_share_links')
    .insert({ token, statement_id: statementId, expires_at: expires })
  return error ? null : token
}

export async function POST(req: NextRequest) {
  try {
    const { statementId, send } = await req.json() as { statementId?: string; send?: boolean }
    if (!statementId) return NextResponse.json({ error: '정산서를 선택하세요' }, { status: 400 })

    const db = await getAuthorizedAdminDb()
    if (!db) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

    const draft = await draftPaymentRequest(db, statementId)
    if (!draft.ok) return NextResponse.json({ error: draft.error, draft }, { status: 400 })

    if (!send) {
      return NextResponse.json({
        preview: buildPaymentRequestMessage({ ...draft, shareUrl: '(정산서 링크가 붙습니다)' }),
        phone: draft.phone,
        amount: draft.amount,
      })
    }

    const token = await getOrCreateShareLink(db, statementId)
    if (!token) return NextResponse.json({ error: '정산서 링크를 만들지 못했습니다' }, { status: 500 })

    const origin = new URL(req.url).origin
    const result = await sendPaymentRequest(draft, `${origin}/s/${token}`)
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? '발송 실패', channel: result.channel }, { status: 502 })
    }

    const sentAt = new Date().toISOString()
    await db.from('sales_statements').update({ payment_requested_at: sentAt }).eq('id', statementId)
    return NextResponse.json({ success: true, channel: result.channel, sentAt, phone: draft.phone, amount: draft.amount })
  } catch (e) {
    console.error('[POST /api/admin/settlement/payment-request]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : '입금 요청 중 오류' }, { status: 500 })
  }
}
