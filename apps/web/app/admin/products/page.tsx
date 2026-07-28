export const runtime = 'edge'

import Link from 'next/link'
import { getSessionUser } from '@/lib/supabase/server'
import CategoryFilter from './CategoryFilter'

const CATEGORY_LABEL: Record<string, string> = {
  vegetable: '채소',
  fruit: '과일',
  meat: '육류',
  seafood: '수산',
  grain: '곡류',
  dairy: '유제품',
  seasoning: '양념',
  etc: '기타',
}

interface Props {
  searchParams: Promise<{ category?: string }>
}

export default async function AdminProductsPage({ searchParams }: Props) {
  const { category: categoryParam } = await searchParams
  const { supabase: db } = await getSessionUser()

  const { data: products } = await db
    .from('products')
    .select('id, standard_name, category, default_unit, is_kg_based, is_fixed_price, status, image_path')
    .order('category')
    .order('standard_name')

  const all = products ?? []

  const categoryCounts = all.reduce<Record<string, number>>((acc, p) => {
    const cat = p.category ?? 'etc'
    acc[cat] = (acc[cat] ?? 0) + 1
    return acc
  }, {})

  const filtered = categoryParam ? all.filter(p => p.category === categoryParam) : all
  const activeCategory = categoryParam ?? null

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">품목 마스터</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {activeCategory ? `${CATEGORY_LABEL[activeCategory] ?? activeCategory} ${filtered.length}개` : `전체 ${all.length}개`}
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 transition-colors"
        >
          + 품목 등록
        </Link>
      </div>

      <CategoryFilter categoryCounts={categoryCounts} total={all.length} activeCategory={activeCategory} />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">품목명</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden sm:table-cell">카테고리</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden sm:table-cell">기본 단위</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">kg 기준</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">상태</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  <div className="flex items-center gap-2">
                    {p.image_path && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_path} alt={p.standard_name} className="w-8 h-8 rounded object-cover" />
                    )}
                    {p.standard_name}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                  {CATEGORY_LABEL[p.category ?? ''] ?? p.category}
                </td>
                <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{p.default_unit}</td>
                <td className="px-4 py-3 hidden md:table-cell">
                  {p.is_kg_based && (
                    <span className="rounded-full bg-blue-100 text-blue-700 text-xs px-2 py-0.5">kg 단가</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full text-xs px-2 py-0.5 font-medium ${
                    p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {p.status === 'active' ? '활성' : '비활성'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/products/${p.id}`} className="text-xs text-brand-600 hover:underline">
                    편집
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">
                  {activeCategory ? `${CATEGORY_LABEL[activeCategory] ?? activeCategory} 카테고리 품목이 없습니다.` : '등록된 품목이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
