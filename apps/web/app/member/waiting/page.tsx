export const runtime = 'edge'

import { redirect } from 'next/navigation'

import { getSessionUser } from '@/lib/supabase/server'
import WaitingManager from './WaitingManager'

interface Props {
  searchParams: Promise<{ date?: string }>
}

export default async function MemberWaitingPage({ searchParams }: Props) {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')

  const { date: requestedDate } = await searchParams
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate ?? '') ? requestedDate! : today

  return <WaitingManager date={date} today={today} />
}
