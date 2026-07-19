export const runtime = 'edge'

import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import MemberNav from './MemberNav'

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <MemberNav />
      <main className="flex-1">{children}</main>
    </div>
  )
}
