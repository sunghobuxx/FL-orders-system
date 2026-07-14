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
import { getKstToday } from '@/lib/date-kst'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { businessDate?: string }
    const businessDate: string = body.businessDate ?? getKstToday()

    const adminDb = createAdminClient()

    const { grouped } = await getCurrentDispatchGroups(adminDb, businessDate)
    const supplierIds = Object.keys(grouped)

    if (!supplierIds.length) {
      return NextResponse.json({ success: true, businessDate, dispatched: 0, processedDates: [businessDate], message: '발주 없음' })
    }

    // 1. 기존 dispatch_jobs 일괄 조회
    const { data: existingJobs } = await adminDb
      .from('dispatch_jobs')
      .select('id, supplier_id, status')
      .eq('business_date', businessDate)
      .in('supplier_id', supplierIds)

    const existingJobMap = new Map<string, { id: string; status: string }>(
      (existingJobs ?? []).map((j: { supplier_id: string; id: string; status: string }) => [j.supplier_id, { id: j.id, status: j.status }])
    )

    // 2. 이미 발송된 dispatch_messages 일괄 조회
    const existingJobIds = (existingJobs ?? []).map((j: { id: string }) => j.id)
    const { data: sentMessages } = existingJobIds.length
      ? await adminDb
          .from('dispatch_messages')
          .select('dispatch_job_id')
          .in('dispatch_job_id', existingJobIds)
          .eq('status', 'sent')
      : { data: [] as { dispatch_job_id: string }[] }

    const sentJobIdSet = new Set((sentMessages ?? []).map((m: { dispatch_job_id: string }) => m.dispatch_job_id))

    // 3. 공급처 연락처 일괄 조회
    const { data: supplierRows } = await adminDb
      .from('suppliers')
      .select('id, organization_id')
      .in('id', supplierIds)

    const orgIds = (supplierRows ?? []).map((s: { organization_id: string }) => s.organization_id).filter(Boolean) as string[]
    const { data: contacts } = orgIds.length
      ? await adminDb
          .from('contacts')
          .select('organization_id, phone')
          .in('organization_id', orgIds)
          .eq('is_primary', true)
      : { data: [] as { organization_id: string; phone: string }[] }

    const orgToPhone = new Map((contacts ?? []).map((c: { organization_id: string; phone: string }) => [c.organization_id, c.phone]))
    const supplierOrgMap = new Map((supplierRows ?? []).map((s: { id: string; organization_id: string }) => [s.id, s.organization_id]))

    let dispatched = 0

    for (const supplierId of supplierIds) {
      const items = (grouped as Record<string, DispatchOrderItem[]>)[supplierId]

      let job = existingJobMap.get(supplierId)

      // dispatch_job 없으면 생성
      if (!job) {
        const { data: newJob } = await adminDb
          .from('dispatch_jobs')
          .insert({
            supplier_id: supplierId,
            business_date: businessDate,
            status: 'pending',
            idempotency_key: `${supplierId}_${businessDate}`,
          })
          .select('id, status')
          .single()
        if (!newJob) continue
        job = { id: newJob.id, status: newJob.status }
      }

      const jobId = job.id

      // 이미 발송된 경우 skip
      if (sentJobIdSet.has(jobId)) continue

      // dispatch_job_items 동기화 (active items 없으면 재sync)
      const { data: existingItems } = await adminDb
        .from('dispatch_job_items')
        .select('id')
        .eq('dispatch_job_id', jobId)
        .eq('is_excluded', false)
        .limit(1)

      if (!existingItems?.length) {
        await syncDispatchJobItems(adminDb, jobId, items)
      }

      // 발주 라인 구성 (확정 items → fallback: order items 직접)
      let messageLines: string
      const lines = await buildLinesFromDispatchJob(adminDb, jobId)
      if (lines.length) {
        messageLines = lines.map((l) => formatDispatchLine(l)).join('\n')
      } else {
        const fallbackLines = buildDispatchLines(items)
        if (!fallbackLines.length) continue
        messageLines = fallbackLines.map((l) => formatDispatchLine(l)).join('\n')
      }

      if (!messageLines.trim()) continue

      // 연락처 조회
      const orgId = supplierOrgMap.get(supplierId)
      const phone = orgId ? orgToPhone.get(orgId) : undefined
      if (!phone) {
        console.warn(`[auto-dispatch] 연락처 없음: supplier ${supplierId}`)
        continue
      }

      // 알림톡 발송
      const templateId = process.env.SOLAPI_DISPATCH_TEMPLATE_ID ?? ''
      const templateBody = `[발주내역]\n${businessDate}\n\n#{items}`

      const result = await sendKakaoAlimtalk({
        receiverNum: phone,
        templateId,
        templateBody,
        variables: { items: messageLines },
      })

      // dispatch_messages 기록
      await adminDb.from('dispatch_messages').insert({
        dispatch_job_id: jobId,
        status: result.success ? 'sent' : 'failed',
        external_message_id: result.externalId ?? null,
        error_message: result.error ?? null,
        sent_at: new Date().toISOString(),
      })

      if (result.success) {
        await adminDb.from('dispatch_jobs').update({ status: 'sent' }).eq('id', jobId)
        dispatched++
      } else {
        console.error(`[auto-dispatch] 발송 실패: supplier ${supplierId}`, result.error)
      }
    }

    return NextResponse.json({ success: true, businessDate, dispatched, processedDates: [businessDate] })
  } catch (e) {
    console.error('[POST /api/admin/orders/auto-dispatch]', e)
    return NextResponse.json({ error: '처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
