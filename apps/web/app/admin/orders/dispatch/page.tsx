export const runtime = 'edge'

import { redirect } from 'next/navigation'
import { getKstToday } from '@/lib/date-kst'

export default function DispatchIndexPage() {
  redirect(`/admin/orders/dispatch/${getKstToday()}`)
}
