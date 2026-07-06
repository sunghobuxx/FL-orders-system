'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

const TABS = [
  { href: '/admin/members', label: '회원 목록', exact: true },
  { href: '/admin/members/new', label: '신규 등록' },
]

export default function AdminMembersShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold text-gray-900">회원 관리</h1>
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(tab => {
          const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg -mb-px transition-colors ${
                isActive
                  ? 'bg-white text-brand-700 border border-b-white border-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
      {children}
    </div>
  )
}
