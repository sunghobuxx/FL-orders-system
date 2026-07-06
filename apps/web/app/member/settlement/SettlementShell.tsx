'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  orgName: string
  date: string
}

export default function SettlementShell({ children, orgName, date }: Props) {
  const pathname = usePathname()

  const TABS = [
    { href: '/member/spec', label: '오늘 명세서' },
    { href: '/member/settlement/history', label: '정산 내역' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-0">
          <div className="flex items-baseline justify-between mb-3">
            <h1 className="text-lg font-bold text-gray-900">{orgName || '정산'}</h1>
            {date && <span className="text-sm text-gray-500">{date}</span>}
          </div>
          <div className="flex gap-1">
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
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-4">
        {children}
      </div>
    </div>
  )
}
