export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { apiError, validationError } from '@/lib/api-error'
import { getSessionUser } from '@/lib/supabase/server'

const STATUS_FLOW = ['open', 'submitted', 'validated', 'ordered', 'dispatched', 'completed'] as const

export async function POST(req: Request) {
  try {
    const { batchId, newStatus } = await req.json() as { batchId: string; newStatus: string }
    if (!batchId || !newStatus) return validationError('필수 값 누락')

    const { supabase: db } = await getSessionUser()
    const { data: batch } = await db.from('order_batches').select('status').eq('id', batchId).single()
    if (!batch) return NextResponse.json({ error: '배치를 찾을 수 없습니다.' }, { status: 404 })

    const currentIndex = STATUS_FLOW.indexOf(batch.status as typeof STATUS_FLOW[number])
    const nextIndex = STATUS_FLOW.indexOf(newStatus as typeof STATUS_FLOW[number])
    if (nextIndex <= currentIndex) return NextResponse.json({ error: '이미 처리된 상태입니다.' }, { status: 400 })

    const { error } = await db.from('order_batches').update({ status: newStatus }).eq('id', batchId)
    if (error) return apiError('상태 업데이트에 실패했습니다')

    return NextResponse.json({ success: true })
  } catch {
    return apiError('요청 처리 중 오류가 발생했습니다')
  }
}
