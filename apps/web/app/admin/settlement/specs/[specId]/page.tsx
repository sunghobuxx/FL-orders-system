export const runtime = 'edge'

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getSessionUser } from '@/lib/supabase/server'

import { AdminSpecPrintButton } from '@/app/admin/settlement/AdminPrintButtons'
import AdminSettlementShell from '@/app/admin/settlement/AdminSettlementShell'
import { RecalcButton, RegenFromOrderButton } from '@/app/admin/settlement/specs/RecalcButton'
import SpecEditPanel from './SpecEditPanel'

interface Props { params: Promise<{ specId: string }> }

export default async function AdminSpecDetailPage({ params }: Props) {
  const { specId } = await params
  const { supabase: db } = await getSessionUser()

  const { data: spec } = await db
    .from('daily_specs')
    .select('id, business_date, total_amount, vat_amount, restaurants(organizations(name))')
    .eq('id', specId)
    .single()

  if (!spec) notFound()

  const { data: rawLines } = await db
    .from('daily_spec_lines')
    .select('id, product_id, qty, unit, unit_price, vat_amount, products(standard_name, taxable_flag)')
    .eq('daily_spec_id', specId)

  const restRaw = spec.restaurants as unknown as { organizations: { name: string } | null } | null
  const orgName = restRaw?.organizations?.name ?? '알 수 없음'

  type RawLine = { id: string; product_id: string; qty: number; unit: string; unit_price: number; vat_amount: number; products: { standard_name: string; taxable_flag: boolean | null } }
  const lines = (rawLines ?? []) as unknown as RawLine[]

  const panelLines = lines.map(l => ({
    id: l.id,
    product_name: l.products?.standard_name ?? '-',
    qty: Number(l.qty),
    unit: l.unit,
    unit_price: Number(l.unit_price),
    vat_amount: Number(l.vat_amount ?? 0),
    taxable_flag: l.products?.taxable_flag ?? false,
  }))

  return (
    <AdminSettlementShell>
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-3">
          <Link href="/admin/settlement/specs" className="text-sm text-gray-400 hover:text-gray-600">← 목록</Link>
        </div>

        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">업체명:</span>
            <span className="bg-gray-100 px-4 py-1.5 rounded font-semibold text-gray-800">{orgName}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">날짜:</span>
            <span className="bg-gray-100 px-4 py-1.5 rounded text-gray-500">{spec.business_date}</span>
          </div>
        </div>

        <SpecEditPanel specId={specId} lines={panelLines} />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <RecalcButton specId={specId} />
            <RegenFromOrderButton businessDate={spec.business_date} />
          </div>
          <div className="flex items-center gap-3">
            <AdminSpecPrintButton specId={specId} />
            <Link
              href="/admin/settlement/specs"
              className="rounded-lg bg-brand-600 text-white px-6 py-2.5 text-sm font-semibold hover:bg-brand-700"
            >
              확인
            </Link>
          </div>
        </div>
      </div>
    </AdminSettlementShell>
  )
}
