export const runtime = 'edge'

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import ProductEditForm from './ProductEditForm'
import ImageUpload from './ImageUpload'
import DeleteProductButton from './DeleteProductButton'
import AddSupplierProductForm from './AddSupplierProductForm'
import DeleteSupplierProductButton from './DeleteSupplierProductButton'
import PriceSnapshotForm from './PriceSnapshotForm'
import OrgPriceSection from './OrgPriceSection'

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdminProductEditPage({ params }: Props) {
  const { id } = await params
  const db = createAdminClient()

  const [
    { data: product },
    { data: supplierProductsRaw },
    { data: allSuppliers },
    { data: orgPriceRows },
    { data: allOrgRows },
  ] = await Promise.all([
    db.from('products')
      .select('id, standard_name, category, default_unit, sku, taxable_flag, is_kg_based, is_fixed_price, status, allowed_units, image_path')
      .eq('id', id)
      .single(),
    db.from('supplier_products')
      .select('id, supplier_id, supplier_name, purchase_unit, status, suppliers(organizations(name))')
      .eq('product_id', id)
      .order('created_at'),
    db.from('suppliers')
      .select('id, organizations(name)')
      .eq('status', 'active'),
    db.from('org_product_prices')
      .select('organization_id, unit_price, organizations(name)')
      .eq('product_id', id),
    db.from('organizations')
      .select('id, name')
      .eq('organization_type', 'restaurant')
      .eq('status', 'active')
      .order('name'),
  ])

  if (!product) notFound()

  type SpRow = {
    id: string
    supplier_id: string
    supplier_name: string
    purchase_unit: string
    status: string
    suppliers: { organizations: { name: string } | null } | null
  }
  const supplierProducts = (supplierProductsRaw ?? []) as unknown as SpRow[]

  // price_snapshots for each supplier_product
  const spIds = supplierProducts.map(sp => sp.id)
  const { data: allSnapshots } = spIds.length
    ? await db.from('price_snapshots')
        .select('id, supplier_product_id, sale_price, purchase_price, unit, effective_from')
        .in('supplier_product_id', spIds)
        .order('effective_from', { ascending: false })
    : { data: [] }

  type OrgPriceRow = { organization_id: string; unit_price: number; organizations: { name: string } | null }
  const orgPrices = (orgPriceRows ?? []).map((r) => {
    const row = r as unknown as OrgPriceRow
    return {
      organization_id: row.organization_id,
      orgName: row.organizations?.name ?? row.organization_id,
      unit_price: Number(row.unit_price),
    }
  })
  type OrgRow = { id: string; name: string }
  const allOrgs = (allOrgRows ?? []).map((o: OrgRow) => ({ id: o.id, name: o.name }))

  type SupRow = { id: string; organizations: { name: string } | null }
  const suppliersForSelect = ((allSuppliers ?? []) as unknown as SupRow[]).map(s => ({
    id: s.id,
    name: s.organizations?.name ?? '(이름 없음)',
  }))

  const linkedSupplierIds = new Set(supplierProducts.map(sp => sp.supplier_id))
  const availableSuppliers = suppliersForSelect.filter(s => !linkedSupplierIds.has(s.id))

  return (
    <div className="p-6 max-w-xl space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/admin/products" className="text-sm text-gray-400 hover:text-gray-700">← 목록</a>
          <h1 className="text-lg font-bold text-gray-900">품목 편집</h1>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            product.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {product.status === 'active' ? '활성' : '비활성'}
          </span>
        </div>
        <DeleteProductButton productId={product.id} />
      </div>

      {/* 기본 정보 편집 */}
      <ProductEditForm product={product as Parameters<typeof ProductEditForm>[0]['product']} />

      {/* 이미지 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">품목 이미지</h2>
        <ImageUpload productId={product.id} imagePath={product.image_path} />
      </div>

      {/* 공급처 연결 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">공급처 연결</h2>
          {availableSuppliers.length > 0 && (
            <AddSupplierProductForm productId={product.id} suppliers={availableSuppliers} />
          )}
        </div>

        {supplierProducts.length === 0 ? (
          <p className="text-sm text-gray-400">연결된 공급처가 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {supplierProducts.map(sp => {
              const snapshots = (allSnapshots ?? []).filter(s => s.supplier_product_id === sp.id)
              const orgName = sp.suppliers?.organizations?.name ?? '알 수 없음'
              return (
                <div key={sp.id} className="rounded-lg border border-gray-100 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-semibold text-gray-900">{orgName}</span>
                      {sp.supplier_name && (
                        <span className="ml-2 text-xs text-gray-500">({sp.supplier_name})</span>
                      )}
                      <span className="ml-2 text-xs text-gray-400">{sp.purchase_unit}</span>
                    </div>
                    <DeleteSupplierProductButton supplierProductId={sp.id} />
                  </div>
                  <PriceSnapshotForm
                    productId={product.id}
                    supplierProductId={sp.id}
                    snapshots={snapshots}
                    defaultUnit={sp.purchase_unit || product.default_unit}
                  />
                </div>
              )
            })}
          </div>
        )}

        {availableSuppliers.length === 0 && supplierProducts.length === 0 && (
          <p className="text-xs text-gray-400 mt-1">등록된 활성 공급처가 없습니다.</p>
        )}
      </div>

      {/* 업체별 고정단가 */}
      <OrgPriceSection
        productId={product.id}
        orgPrices={orgPrices}
        allOrgs={allOrgs}
      />
    </div>
  )
}
