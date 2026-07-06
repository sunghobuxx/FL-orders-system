'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

const TABS = [
  { href: '/member/notices', label: '공지사항' },
  { href: '/member/inquiries', label: '1:1 문의' },
]

export default function NoticesShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(tab => {
          const isActive = pathname.startsWith(tab.href)
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
