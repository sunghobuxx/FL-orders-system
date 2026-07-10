export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const { period_type, start_date, end_date } = await req.json() as {
      period_type: string
      start_date: string
      end_date: string
    }
    if (!period_type || !start_date || !end_date) {
      return NextResponse.json({ error: '필드 누락' }, { status: 400 })
    }
    const db = createAdminClient()
    const { data, error } = await db
      .from('settlement_periods')
      .insert({ period_type, start_date, end_date, status: 'open' })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ id: data.id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '오류' }, { status: 500 })
  }
}
