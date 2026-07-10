'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  orgName: string
  date: string
}

const TABS = [
  { href: '/member/spec', label: '당일명세서' },
  { href: '/member/settlement/history', label: '명세서내역' },
  { href: '/member/settlement', label: '정산' },
]

function isActive(pathname: string, tabHref: string) {
  if (tabHref === '/member/settlement') {
    return pathname === '/member/settlement' ||
      (pathname.startsWith('/member/settlement/') && !pathname.startsWith('/member/settlement/history'))
  }
  return pathname === tabHref || pathname.startsWith(tabHref + '/')
}

export default function SettlementShell({ children, orgName, date }: Props) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      <div className="md:hidden flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 overflow-x-auto">
        {TABS.map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap ${
              isActive(pathname, tab.href)
                ? 'bg-gray-800 text-white border-gray-800'
                : 'text-gray-700 border-gray-200'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:flex w-40 shrink-0 bg-white border-r border-gray-200 flex-col gap-2 p-3 pt-5">
          {TABS.map(tab => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`block text-center px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                isActive(pathname, tab.href)
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </aside>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
            <div className="flex items-center gap-1.5 text-sm min-w-0">
              <span className="text-gray-500 shrink-0">업체명:</span>
              <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded font-medium truncate">{orgName}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm shrink-0 ml-2">
              <span className="bg-gray-100 text-gray-400 px-2 py-1 rounded text-xs">{date}</span>
            </div>
          </div>
          <div className="flex-1 p-4 md:p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
