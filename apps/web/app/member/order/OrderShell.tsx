'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  orgName: string
  date: string
  hideMeta?: boolean
}

export default function OrderShell({ children, orgName, date, hideMeta = false }: Props) {
  const pathname = usePathname()

  const TABS = [
    { href: `/member/order`, label: '당일발주', exact: true },
    { href: `/member/order-confirm`, label: '발주확인' },
    { href: `/member/order-history`, label: '발주내역' },
  ]

  const tabClass = (isActive: boolean) => `block px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
    isActive
      ? 'bg-gray-800 text-white'
      : 'text-gray-600 hover:bg-gray-100'
  }`

  return (
    <div className="flex min-h-[calc(100vh-56px)] bg-gray-50">
      <aside className="hidden md:block w-40 shrink-0 border-r border-gray-200 bg-white p-3">
        <nav className="space-y-1">
          {TABS.map(tab => {
            const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
            return (
              <Link key={tab.href} href={tab.href} className={tabClass(isActive)}>
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </aside>
      <div className="flex-1 w-full">
        <div className="sticky top-14 z-10 bg-white border-b border-gray-200 md:hidden">
          <div className="px-4 py-2 flex gap-1 overflow-x-auto">
            {TABS.map(tab => {
              const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
              return (
                <Link key={tab.href} href={tab.href} className={tabClass(isActive)}>
                  {tab.label}
                </Link>
              )
            })}
          </div>
        </div>
        <div className="max-w-2xl px-4 py-4 space-y-4">
          {!hideMeta && (
            <div className="text-sm text-gray-600 space-y-1">
              <div>업체명: <span className="font-semibold text-gray-900">{orgName || '-'}</span></div>
              {date && <div>날짜: <span className="font-semibold text-gray-900">{date}</span></div>}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}
