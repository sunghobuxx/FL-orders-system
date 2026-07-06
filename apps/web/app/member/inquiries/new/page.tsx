export const runtime = 'edge'

import { redirect } from 'next/navigation'

import { getSessionUser } from '@/lib/supabase/server'

import NoticesShell from '../../notices/NoticesShell'
import { InquiryForm } from './InquiryForm'

export default async function NewInquiryPage() {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')

  return (
    <NoticesShell>
      <div className="space-y-4 max-w-2xl">
        <InquiryForm />
      </div>
    </NoticesShell>
  )
}
