'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

const SIDEBAR_ITEMS = [
  { href: '/admin/settlement/specs', label: '당일명세서', match: (p: string) => p.startsWith('/admin/settlement/specs') },
  { href: '/admin/settlement/history', label: '명세서내역', match: (p: string) => p.startsWith('/admin/settlement/history') },
  { href: '/admin/settlement', label: '주/월 정산', match: (p: string) => p === '/admin/settlement' || p.startsWith('/admin/settlement/restaurant') },
  { href: '/admin/finance', label: '입/출금', match: (p: string) => p.startsWith('/admin/finance') },
  { href: '/admin/purchase', label: '매입 정산', match: (p: string) => p.startsWith('/admin/purchase') },
]

export default function AdminSettlementShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <aside className="hidden lg:flex w-44 shrink-0 flex-col bg-white border-r border-gray-200 p-2 gap-1">
        <p className="px-2 pt-1 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">정산 관리</p>
        {SIDEBAR_ITEMS.map(item => {
          const isActive = item.match(pathname)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2.5 text-sm rounded-lg transition-colors font-semibold ${
                isActive
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </aside>
      <div className="flex-1 p-6 min-w-0">
        {children}
      </div>
    </div>
  )
}
