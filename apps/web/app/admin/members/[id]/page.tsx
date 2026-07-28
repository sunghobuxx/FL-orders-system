export const runtime = 'edge'

import { notFound } from 'next/navigation'

import { getOrganizationLoginUser, requireAuthorizedAdminDb } from '@/lib/admin-member-user'

import AdminMembersShell from '../AdminMembersShell'
import DeleteMemberButton from '../DeleteMemberButton'
import ProductSelectForm from '../ProductSelectForm'
import MemberFormClient from './MemberFormClient'
import ImpersonateButton from './ImpersonateButton'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ mode?: string }>
}

export default async function MemberDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  const { mode } = await searchParams
  const isEdit = mode === 'edit'
  const db = await requireAuthorizedAdminDb()

  const [{ data: org }, { data: contacts }, { data: rest }, { data: supplier }] = await Promise.all([
    db.from('organizations').select('id, name, organization_type, status').eq('id', id).single(),
    db.from('contacts').select('name, phone').eq('organization_id', id).eq('is_primary', true).maybeSingle(),
    db.from('restaurants').select('id, biz_no, settlement_cycle, waiting_enabled').eq('organization_id', id).maybeSingle(),
    db.from('suppliers').select('id').eq('organization_id', id).maybeSingle(),
  ])

  // Supabase Auth의 실제 로그인 이메일을 조회한다.
  const loginUser = await getOrganizationLoginUser(db, id)
  const memberEmail = loginUser?.email ?? null

  if (!org) notFound()

  const isSupplier = org.organization_type === 'supplier'

  // 전체 품목 목록
  const { data: allProducts } = await db
    .from('products')
    .select('id, standard_name, default_unit, category')
    .eq('status', 'active')
    .order('category')
    .order('standard_name')

  // 매입처: 취급 품목 (supplier_products)
  let supplierLinkedIds = new Set<string>()
  if (isSupplier && supplier) {
    const { data: spLinks } = await db
      .from('supplier_products')
      .select('product_id')
      .eq('supplier_id', supplier.id)
    supplierLinkedIds = new Set((spLinks ?? []).map((s: { product_id: string }) => s.product_id))
  }

  // 매출 업체: 발주 가능 품목 (restaurant_products)
  let restaurantLinkedIds = new Set<string>()
  if (!isSupplier && rest) {
    const { data: rpLinks } = await db
      .from('restaurant_products')
      .select('product_id')
      .eq('restaurant_id', rest.id)
    restaurantLinkedIds = new Set((rpLinks ?? []).map((r: { product_id: string }) => r.product_id))
  }

  // entityId: 폼에서 hidden input으로 전달 (bind 불필요)
  const entityId = isSupplier ? supplier?.id : rest?.id
  const showProductForm = isSupplier ? !!supplier : !!rest

  const typeBadge = isSupplier
    ? { label: '매입 공급처', cls: 'bg-purple-100 text-purple-700' }
    : { label: '매출 업체', cls: 'bg-blue-100 text-blue-700' }

  const linkedIds = isSupplier ? supplierLinkedIds : restaurantLinkedIds

  return (
    <AdminMembersShell>
      <div className="max-w-2xl space-y-4">
        {/* 헤더: 업체명 + 분류 배지 + 회원 로그인 + 삭제 */}
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm font-semibold text-gray-800">{org.name}</p>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${typeBadge.cls}`}>
            {typeBadge.label}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {!isSupplier && memberEmail && (
              <ImpersonateButton orgId={id} memberEmail={memberEmail} />
            )}
            {isSupplier && supplier && (
              <a
                href={`/admin/suppliers/${supplier.id}`}
                className="rounded-lg border border-purple-200 text-purple-700 px-4 py-2 text-sm font-semibold hover:bg-purple-50"
              >
                공급처 관리
              </a>
            )}
            <DeleteMemberButton orgId={id} orgName={org.name} />
          </div>
        </div>

        {/* 기본정보 폼 */}
        <MemberFormClient
          orgId={id}
          isEdit={isEdit}
          org={org}
          contacts={contacts}
          memberEmail={memberEmail}
          rest={rest}
          isSupplier={isSupplier}
        />

        {/* 품목 관리: 매출 업체 = 발주 가능 품목 / 매입 공급처 = 취급 품목 */}
        {showProductForm && entityId && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700">
                {isSupplier ? '취급 품목 관리' : '발주 가능 품목 설정'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {isSupplier
                  ? '이 공급처가 납품하는 품목을 선택하세요'
                  : '이 업체가 발주할 수 있는 품목만 선택하세요. 미설정 시 전체 품목 표시'}
              </p>
            </div>
            <ProductSelectForm
              entityId={entityId}
              isSupplier={isSupplier}
              allProducts={(allProducts ?? []) as { id: string; standard_name: string; default_unit: string; category: string }[]}
              linkedIds={[...linkedIds]}
            />
          </div>
        )}
      </div>
    </AdminMembersShell>
  )
}
