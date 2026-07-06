export const runtime = 'edge'

import Link from 'next/link'

import { getSessionUser } from '@/lib/supabase/server'

import AdminMembersShell from '../AdminMembersShell'
import NewMemberForm from './NewMemberForm'

interface Props {
  searchParams: Promise<{ type?: string }>
}

export default async function NewMemberPage({ searchParams }: Props) {
  const { type = 'restaurant' } = await searchParams
  const { supabase: db } = await getSessionUser()
  const isSupplier = type === 'supplier'

  const { data: products } = isSupplier
    ? await db.from('products').select('id, standard_name, default_unit').eq('status', 'active').order('standard_name')
    : { data: [] }

  const typeBadge = isSupplier
    ? { label: '매입 공급처', cls: 'bg-purple-100 text-purple-700' }
    : { label: '매출 업체', cls: 'bg-blue-100 text-blue-700' }

  return (
    <AdminMembersShell>
      <div className="max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-gray-800">회원 등록</p>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${typeBadge.cls}`}>
              {typeBadge.label}
            </span>
          </div>
          <div className="flex gap-1 text-xs">
            <Link href="/admin/members/new?type=restaurant"
              className={`px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                !isSupplier ? 'bg-gray-800 text-white border-gray-800' : 'text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}>
              매출 업체
            </Link>
            <Link href="/admin/members/new?type=supplier"
              className={`px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                isSupplier ? 'bg-gray-800 text-white border-gray-800' : 'text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}>
              매입 공급처
            </Link>
          </div>
        </div>

        <NewMemberForm
          orgType={type}
          products={(products ?? []) as { id: string; standard_name: string; default_unit: string }[]}
        />
      </div>
    </AdminMembersShell>
  )
}
