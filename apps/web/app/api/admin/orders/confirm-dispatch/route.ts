export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getCurrentDispatchGroups,
  buildLinesFromDispatchJob,
  buildDispatchLines,
  formatDispatchLine,
  syncDispatchJobItems,
  type DispatchOrderItem,
} from '@/lib/dispatch/current-items'
import { sendKakaoAlimtalk } from '@/lib/messaging/kakao'

// 특정 공급처 dispatch 확정 및 발송
export async function POST(req: NextRequest) {
  try {
    const { supplierId, businessDate } = await req.json() as { supplierId: string; businessDate: string }

    if (!supplierId || !businessDate) {
      return NextResponse.json({ error: '필수 값 누락 (supplierId, businessDate)' }, { status: 400 })
    }

    const adminDb = createAdminClient()

    // 해당 공급처 발주 items 조회
    const { grouped } = await getCurrentDispatchGroups(adminDb, businessDate)
    const items = (grouped as Record<string, DispatchOrderItem[]>)[supplierId]

    if (!items?.length) {
      return NextResponse.json({ error: '해당 공급처의 발주 내역이 없습니다' }, { status: 404 })
    }

    // dispatch_job 조회 또는 생성
    const { data: existingJob } = await adminDb
      .from('dispatch_jobs')
      .select('id, status')
      .eq('business_date', businessDate)
      .eq('supplier_id', supplierId)
      .maybeSingle()

    let jobId: string
    if (existingJob) {
      jobId = existingJob.id
    } else {
      const { data: newJob, error } = await adminDb
        .from('dispatch_jobs')
        .insert({ supplier_id: supplierId, business_date: businessDate, status: 'pending', idempotency_key: `${supplierId}_${businessDate}` })
        .select('id')
        .single()
      if (error || !newJob) {
        console.error('[confirm-dispatch] dispatch_job 생성 실패', error)
        return NextResponse.json({ error: 'dispatch_job 생성 실패' }, { status: 500 })
      }
      jobId = newJob.id
    }

    // dispatch_job_items 재sync (최신 order_items 반영)
    await syncDispatchJobItems(adminDb, jobId, items)

    // 이미 발송된 경우 check
    const { data: sentMsg } = await adminDb
      .from('dispatch_messages')
      .select('id')
      .eq('dispatch_job_id', jobId)
      .eq('status', 'sent')
      .maybeSingle()

    if (sentMsg) {
      return NextResponse.json({ success: true, jobId, alreadySent: true })
    }

    // 발주 라인 구성
    let messageLines: string
    const lines = await buildLinesFromDispatchJob(adminDb, jobId)
    if (lines.length) {
      messageLines = lines.map((l) => formatDispatchLine(l)).join('\n')
    } else {
      const fallbackLines = buildDispatchLines(items)
      messageLines = fallbackLines.map((l) => formatDispatchLine(l)).join('\n')
    }

    if (!messageLines.trim()) {
      return NextResponse.json({ error: '발송할 품목이 없습니다' }, { status: 400 })
    }

    // 연락처 조회
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

    // 알림톡 발송
    const templateId = process.env.SOLAPI_DISPATCH_TEMPLATE_ID ?? ''
    const templateBody = `[발주내역]\n${businessDate}\n\n#{items}`

    const result = await sendKakaoAlimtalk({
      receiverNum: contact.phone,
      templateId,
      templateBody,
      variables: { items: messageLines },
    })

    await adminDb.from('dispatch_messages').insert({
      dispatch_job_id: jobId,
      status: result.success ? 'sent' : 'failed',
      external_message_id: result.externalId ?? null,
      error_message: result.error ?? null,
      sent_at: new Date().toISOString(),
    })

    if (result.success) {
      await adminDb.from('dispatch_jobs').update({ status: 'sent' }).eq('id', jobId)
    }

    return NextResponse.json({ success: result.success, jobId, error: result.error })
  } catch (e) {
    console.error('[POST /api/admin/orders/confirm-dispatch]', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
