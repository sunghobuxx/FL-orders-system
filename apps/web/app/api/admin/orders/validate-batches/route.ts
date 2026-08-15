export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-member-user'
import { getCurrentDispatchGroups, syncDispatchJobItems } from '@/lib/dispatch/current-items'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const { businessDate } = await req.json() as { businessDate: string }
    if (!businessDate) return NextResponse.json({ error: '날짜 누락' }, { status: 400 })

    // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user } = session

    const adminDb = createAdminClient()

    // 1. submitted 상태 배치들 validated로 변경
    const { data: updated } = await adminDb
      .from('order_batches')
      .update({ status: 'validated' })
      .eq('business_date', businessDate)
      .eq('status', 'submitted')
      .select('id')

    // 2. dispatch_jobs 생성 (자동발송을 위해)
    const { grouped } = await getCurrentDispatchGroups(adminDb, businessDate)
    const supplierIds = Object.keys(grouped)

    for (const supplierId of supplierIds) {
      const { data: existing } = await adminDb
        .from('dispatch_jobs')
        .select('id')
        .eq('business_date', businessDate)
        .eq('supplier_id', supplierId)
        .maybeSingle()

      let jobId = existing?.id
      if (!jobId) {
        const { data: created } = await adminDb.from('dispatch_jobs').insert({
          supplier_id: supplierId,
          business_date: businessDate,
          status: 'pending',
          idempotency_key: `${supplierId}_${businessDate}`,
        }).select('id').single()
        jobId = created?.id
      }

      // 확정하는 순간 품목까지 채운다.
      // 예전에는 job 껍데기만 만들고 품목은 02:30 발송 직전에야 채워졌다.
      // 그 탓에 확정 후 발송 전 — 정작 수량을 고쳐야 할 때 — 화면에 입력창이 안 나왔다.
      // 발송 직전 sync 가 다시 돌지만 qty_overridden 인 줄은 건드리지 않는다.
      if (jobId) {
        try {
          await syncDispatchJobItems(adminDb, jobId, grouped[supplierId])
        } catch (e) {
          console.error(`[validate-batches] 품목 동기화 실패: supplier ${supplierId}`, e)
        }
      }
    }

    return NextResponse.json({ success: true, validated: (updated ?? []).length })
  } catch (e) {
    console.error('[validate-batches]', e)
    return NextResponse.json({ error: '요청 처리 중 오류 발생' }, { status: 500 })
  }
}
