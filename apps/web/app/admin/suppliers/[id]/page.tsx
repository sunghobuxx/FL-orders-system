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
    <div className="p-6 max-w-lg space-y-4">
      <div className="flex items-center gap-3">
        <a href="/admin/suppliers" className="text-sm text-gray-400 hover:text-gray-700">← 목록</a>
        <h1 className="text-lg font-bold text-gray-900">공급처 편집</h1>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
          supplier.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {supplier.status === 'active' ? '활성' : '비활성'}
        </span>
      </div>
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
