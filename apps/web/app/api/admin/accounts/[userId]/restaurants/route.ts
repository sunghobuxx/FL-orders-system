export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const { restaurantIds } = await req.json() as { restaurantIds: string[] }

  const db = createAdminClient()

  const { error: delError } = await db
    .from('manager_restaurants')
    .delete()
    .eq('user_id', userId)

  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

  if (restaurantIds.length > 0) {
    const { error: insError } = await db
      .from('manager_restaurants')
      .insert(restaurantIds.map(rid => ({ user_id: userId, restaurant_id: rid })))
    if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
