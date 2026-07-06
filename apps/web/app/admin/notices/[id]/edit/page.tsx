export const runtime = 'edge'

import { notFound } from 'next/navigation'

import { getSessionUser } from '@/lib/supabase/server'

import AdminNoticesShell from '../../AdminNoticesShell'
import { EditNoticeForm } from '../../NoticeButtons'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditNoticePage({ params }: Props) {
  const { id } = await params
  const { supabase: db } = await getSessionUser()

  const { data: notice } = await db
    .from('notices')
    .select('id, title, body')
    .eq('id', id)
    .single()

  if (!notice) notFound()

  return (
    <AdminNoticesShell>
      <EditNoticeForm id={id} title={notice.title} body={notice.body} />
    </AdminNoticesShell>
  )
}
