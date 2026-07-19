'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

const TABS = [
  { href: '/member/notices', label: '공지' },
  { href: '/member/inquiries', label: '문의/불편' },
]

export default function NoticesShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-[calc(100vh-56px)] bg-gray-50">
      <aside className="hidden md:block w-40 shrink-0 border-r border-gray-200 bg-white p-3">
        <nav className="space-y-1">
          {TABS.map(tab => {
            const isActive = pathname.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`block px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  isActive ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </aside>
      <div className="flex-1 w-full p-4 space-y-4 max-w-2xl">
        <div className="flex gap-1 border-b border-gray-200 md:hidden">
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
    </div>
  )
}
