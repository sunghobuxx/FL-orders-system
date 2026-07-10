'use client'

import Link from 'next/link'
import { useState } from 'react'

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
  categoryCounts: Record<string, number>
  total: number
  activeCategory: string | null
}

export default function CategoryFilter({ categoryCounts, total, activeCategory }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  const categories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span>카테고리 필터</span>
        <span className="text-gray-400 text-xs">{collapsed ? '펼치기 ▼' : '접기 ▲'}</span>
      </button>

      {!collapsed && (
        <div className="border-t border-gray-100 p-3 flex flex-wrap gap-2">
          <Link
            href="/admin/products"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              !activeCategory
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            전체 {total}개
          </Link>
          {categories.map(([cat, count]) => (
            <Link
              key={cat}
              href={`/admin/products?category=${cat}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {CATEGORY_LABEL[cat] ?? cat} {count}개
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
