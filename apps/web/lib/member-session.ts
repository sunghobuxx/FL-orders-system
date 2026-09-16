import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

// An explicitly supplied invalid bearer must never fall back to a browser cookie.
// Callers using the admin client MUST constrain every query to this user's membership.
export async function getMemberSession(req: NextRequest) {
  if (!req.headers.has('authorization')) return getSessionUser()
  const db = createAdminClient()
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return { user: null, supabase: db }
  const { data, error } = await db.auth.getUser(token)
  return { user: error ? null : data.user, supabase: db }
}
