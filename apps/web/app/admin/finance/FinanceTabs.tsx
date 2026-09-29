'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * 「입/출금」 메뉴 안의 탭. 예전엔 「입금 확인」이 사이드바에 따로 있어 기능이 겹쳐 보였다
 * (2026-09-29 사장님 지적) — 사이드바는 하나로 합치고 화면 안에서 탭으로 오간다.
 */
const TABS = [
  { href: '/admin/finance', label: '미수금 현황', match: (p: string) => !p.startsWith('/admin/finance/bank-transactions') && !p.startsWith('/admin/finance/aliases') },
  { href: '/admin/finance/bank-transactions', label: '입금 확인', match: (p: string) => p.startsWith('/admin/finance/bank-transactions') },
  { href: '/admin/finance/aliases', label: '입금자 별칭', match: (p: string) => p.startsWith('/admin/finance/aliases') },
]

export default function FinanceTabs() {
  const pathname = usePathname()

  return (
    <div className="flex gap-1 text-sm">
      {TABS.map(tab => {
        const isActive = tab.match(pathname)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 rounded-lg border font-medium transition-colors ${
              isActive
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
