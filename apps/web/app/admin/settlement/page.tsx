export const runtime = 'edge'

import { redirect } from 'next/navigation'

export default function AdminSettlementPage() {
  redirect('/admin/settlement/history')
}
