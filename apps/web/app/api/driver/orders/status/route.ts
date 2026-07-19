export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { requireBatchAccess, requireDriverUser } from '@/lib/driver-api'

const STATUS_FLOW = ['open', 'submitted', 'validated', 'ordered', 'dispatched', 'completed'] as const

export async function POST(req: Request) {
  const ctx = await requireDriverUser(req)
  if ('error' in ctx) return ctx.error

  const { batchId, newStatus } = await req.json().catch(() => ({})) as { batchId?: string; newStatus?: string }
  if (!batchId || !newStatus) return NextResponse.json({ error: '필수 값 누락' }, { status: 400 })
  if (!STATUS_FLOW.includes(newStatus as typeof STATUS_FLOW[number])) {
    return NextResponse.json({ error: '올바르지 않은 상태입니다.' }, { status: 400 })
  }

  const access = await requireBatchAccess(ctx, batchId)
  if ('error' in access) return access.error

  const currentIndex = STATUS_FLOW.indexOf(access.batch.status as typeof STATUS_FLOW[number])
  const nextIndex = STATUS_FLOW.indexOf(newStatus as typeof STATUS_FLOW[number])
  if (nextIndex <= currentIndex) return NextResponse.json({ error: '이미 처리된 상태입니다.' }, { status: 400 })

  const { error } = await ctx.db.from('order_batches').update({ status: newStatus }).eq('id', batchId)
  if (error) return NextResponse.json({ error: '상태 업데이트에 실패했습니다.' }, { status: 500 })

  return NextResponse.json({ success: true })
}
