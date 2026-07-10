export const runtime = 'edge'

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import SupplierEditForm from './SupplierEditForm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdminSupplierEditPage({ params }: Props) {
  const { id: supplierId } = await params
  const db = createAdminClient()

  const { data: supplier } = await db
    .from('suppliers')
    .select('id, status, dispatch_channel, organization_id, organizations(name)')
    .eq('id', supplierId)
    .single()

  if (!supplier) notFound()

  const orgRaw = supplier.organizations as unknown as { name: string } | null
  const name = orgRaw?.name ?? '알 수 없음'

  const { data: contact } = await db
    .from('contacts')
    .select('phone')
    .eq('organization_id', supplier.organization_id)
    .eq('is_primary', true)
    .maybeSingle()

  return (
    <div className="p-6 max-w-xl space-y-5">
      <h1 className="text-xl font-bold text-gray-900">공급처 편집</h1>
      <SupplierEditForm data={{
        supplierId,
        name,
        dispatch_channel: supplier.dispatch_channel,
        status: supplier.status,
        phone: contact?.phone ?? null,
      }} />
    </div>
  )
}
