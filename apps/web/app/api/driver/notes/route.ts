export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { DRIVER_NOTE_CATEGORY, requireDriverUser } from '@/lib/driver-api'

export async function GET(req: Request) {
  const ctx = await requireDriverUser(req)
  if ('error' in ctx) return ctx.error

  const { data, error } = await ctx.db
    .from('inquiries')
    .select('id, title, content, status, created_at, updated_at, reply, organizations(name)')
    .eq('category', DRIVER_NOTE_CATEGORY)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notes: data ?? [] })
}

export async function POST(req: Request) {
  const ctx = await requireDriverUser(req)
  if ('error' in ctx) return ctx.error

  return NextResponse.json({ error: '배송 중 전달 사항은 어드민에서 작성합니다.' }, { status: 403 })
}
