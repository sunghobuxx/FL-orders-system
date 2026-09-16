export const runtime = 'edge'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'

export default async function MobilePayment({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const query = new URLSearchParams()
  for (const key of ['amount', 'orderName', 'refType', 'refId']) {
    const value = params[key]
    if (typeof value === 'string') query.set(key, value)
  }
  const next = `/member/payment?${query}`
  const { user } = await getSessionUser()
  // The actual payment page revalidates ownership and outstanding amount.
  redirect(user ? next : `/login?next=${encodeURIComponent(next)}`)
}
