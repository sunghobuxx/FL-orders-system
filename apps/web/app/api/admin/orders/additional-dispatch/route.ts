export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'
import {
  getCurrentDispatchGroups,
  buildDispatchLines,
  formatDispatchLine,
  type DispatchOrderItem,
} from '@/lib/dispatch/current-items'
import { sendKakaoAlimtalk } from '@/lib/messaging/kakao'

/**
 * 추가발주 문자.
 *
 * 02:30 자동발송은 그 시점의 발주를 dispatch_job_items 에 스냅샷으로 남긴다.
 * 그 뒤에 들어온 발주는 어디로도 나가지 않는다.
 *   - auto-dispatch 는 발송 기록이 있는 job 을 건너뛴다
 *   - resend-dispatch 는 갱신되지 않은 옛 스냅샷을 그대로 다시 보낸다
 * 그래서 스냅샷에 없는 품목만 골라 "[추가발주]" 로 따로 보낸다.
 *
 * 하루 한 번만 보낸다. 두 번 보내면 공급처가 같은 품목을 두 번 준비할 수 있다.
 */
export async function POST(req: NextRequest) {
  try {
    // 발주 문자를 보내는 주소다. 로그인 없이 부를 수 있으면 안 된다.
    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 })

    const { supplierId, businessDate } = await req.json() as { supplierId: string; businessDate: string }
    if (!supplierId || !businessDate) {
      return NextResponse.json({ error: '필수 값 누락 (supplierId, businessDate)' }, { status: 400 })
    }

    const adminDb = createAdminClient()

    // 비활성 공급처는 grouped 에 들어오지 않는다. 문자 대상이 아니라는 뜻이다.
    const { grouped } = await getCurrentDispatchGroups(adminDb, businessDate)
    const items = (grouped as Record<string, DispatchOrderItem[]>)[supplierId]
    if (!items?.length) {
      return NextResponse.json({ error: '해당 공급처의 발주 내역이 없습니다' }, { status: 404 })
    }

    // maybeSingle() 을 쓰지 않는다. 같은 공급처·날짜에 job 이 둘이면 에러 후 null 이 되어
    // "발주 문자가 나가지 않았다" 로 잘못 판정한다. 가장 오래된 것을 기준으로 삼는다.
    const { data: jobs } = await adminDb
      .from('dispatch_jobs')
      .select('id, status')
      .eq('business_date', businessDate)
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: true })

    const job = jobs?.[0]
    if (!job) {
      return NextResponse.json({ error: '아직 발주 문자가 나가지 않았습니다' }, { status: 400 })
    }

    const { data: messages } = await adminDb
      .from('dispatch_messages')
      .select('message_type, status')
      .eq('dispatch_job_id', job.id)
      .eq('status', 'sent')

    const sentTypes = (messages ?? []).map((m: { message_type: string }) => m.message_type)
    if (!sentTypes.length) {
      return NextResponse.json({ error: '아직 발주 문자가 나가지 않았습니다' }, { status: 400 })
    }
    if (sentTypes.includes('additional')) {
      return NextResponse.json({ error: '오늘 추가발주를 이미 보냈습니다' }, { status: 400 })
    }

    // 02:30 스냅샷에 없는 품목이 추가분이다.
    const { data: snapshot } = await adminDb
      .from('dispatch_job_items')
      .select('order_item_id')
      .eq('dispatch_job_id', job.id)

    const sentItemIds = new Set(
      (snapshot ?? []).map((r: { order_item_id: string }) => r.order_item_id)
    )
    const newItems = items.filter(i => !sentItemIds.has(i.id))
    if (!newItems.length) {
      return NextResponse.json({ error: '추가된 품목이 없습니다' }, { status: 400 })
    }

    const messageLines = buildDispatchLines(newItems).map(l => formatDispatchLine(l)).join('\n')
    if (!messageLines.trim()) {
      return NextResponse.json({ error: '발송할 품목이 없습니다' }, { status: 400 })
    }

    const { data: supplierRow } = await adminDb
      .from('suppliers')
      .select('organization_id')
      .eq('id', supplierId)
      .single()

    const { data: contact } = supplierRow
      ? await adminDb
          .from('contacts')
          .select('phone')
          .eq('organization_id', supplierRow.organization_id)
          .eq('is_primary', true)
          .maybeSingle()
      : { data: null }

    if (!contact?.phone) {
      return NextResponse.json({ error: '공급처 연락처가 없습니다' }, { status: 400 })
    }

    // 머리말이 등록 템플릿(`[발주내역]`)과 달라 알림톡은 거절된다.
    // sendKakaoAlimtalk 이 SMS 로 자동 대체하고, 실제 경로는 channel 에 남는다.
    const result = await sendKakaoAlimtalk({
      receiverNum: contact.phone,
      templateId: process.env.SOLAPI_DISPATCH_TEMPLATE_ID ?? '',
      templateBody: `[추가발주]\n${businessDate}\n\n#{items}`,
      variables: { items: messageLines },
    })

    // insert 결과를 확인한다. supabase 는 실패해도 예외를 던지지 않아
    // 확인하지 않으면 발송 기록이 조용히 사라진다.
    const { error: msgError } = await adminDb.from('dispatch_messages').insert({
      dispatch_job_id: job.id,
      channel: result.channel,
      message_type: 'additional',
      status: result.success ? 'sent' : 'failed',
      external_message_id: result.externalId ?? null,
      error_message: result.error ?? null,
      sent_at: new Date().toISOString(),
    })
    if (msgError) console.error('[additional-dispatch] dispatch_messages 기록 실패', msgError)

    if (!result.success) {
      console.error('[additional-dispatch] 발송 실패', supplierId, result.error)
      return NextResponse.json({ success: false, error: result.error ?? '발송 실패' })
    }

    // 보낸 품목만 스냅샷에 넣는다. 기존 행은 건드리지 않는다 —
    // 문자용으로 손수 고친 수량(qty_overridden)이 발주 수량으로 되돌아가면 안 된다.
    const { error: itemError } = await adminDb.from('dispatch_job_items').insert(
      newItems.map(i => ({
        dispatch_job_id: job.id,
        order_item_id: i.id,
        qty: i.qty,
        is_excluded: false,
      }))
    )
    if (itemError) console.error('[additional-dispatch] dispatch_job_items 갱신 실패', itemError)

    return NextResponse.json({ success: true, sentCount: newItems.length })
  } catch (e) {
    console.error('[POST /api/admin/orders/additional-dispatch]', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
