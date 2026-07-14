export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildLinesFromDispatchJob, formatDispatchLine } from '@/lib/dispatch/current-items'
import { sendKakaoAlimtalk } from '@/lib/messaging/kakao'

// 이미 확정된 dispatch_job 재발송
export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json() as { jobId: string }

    if (!jobId) {
      return NextResponse.json({ error: '필수 값 누락 (jobId)' }, { status: 400 })
    }

    const adminDb = createAdminClient()

    // dispatch_job 조회
    const { data: job } = await adminDb
      .from('dispatch_jobs')
      .select('id, supplier_id, business_date, status')
      .eq('id', jobId)
      .single()

    if (!job) {
      return NextResponse.json({ error: '발주건을 찾을 수 없습니다' }, { status: 404 })
    }

    // 발주 라인 구성
    const lines = await buildLinesFromDispatchJob(adminDb, jobId)
    if (!lines.length) {
      return NextResponse.json({ error: '발송할 품목이 없습니다' }, { status: 400 })
    }

    const messageLines = lines.map((l) => formatDispatchLine(l)).join('\n')

    // 연락처 조회
    const { data: supplierRow } = await adminDb
      .from('suppliers')
      .select('organization_id')
      .eq('id', job.supplier_id)
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
    const templateBody = `[발주내역]\n${job.business_date}\n\n#{items}`

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

    return NextResponse.json({ success: result.success, error: result.error })
  } catch (e) {
    console.error('[POST /api/admin/orders/resend-dispatch]', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
