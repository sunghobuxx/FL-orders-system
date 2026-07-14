export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase/server'
import { getCurrentDispatchGroups } from '@/lib/dispatch/current-items'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const { businessDate } = await req.json() as { businessDate: string }
    if (!businessDate) return NextResponse.json({ error: '날짜 누락' }, { status: 400 })

    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

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

      if (!existing) {
        await adminDb.from('dispatch_jobs').insert({
          supplier_id: supplierId,
          business_date: businessDate,
          status: 'pending',
          idempotency_key: `${supplierId}_${businessDate}`,
        })
      }
    }

    return NextResponse.json({ success: true, validated: (updated ?? []).length })
  } catch (e) {
    console.error('[validate-batches]', e)
    return NextResponse.json({ error: '요청 처리 중 오류 발생' }, { status: 500 })
  }
}
