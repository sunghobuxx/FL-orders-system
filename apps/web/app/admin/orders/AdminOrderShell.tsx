'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

export default function AdminOrderShell({ children, date }: { children: ReactNode; date?: string | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const kstToday = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
  const currentDate = date ?? kstToday

  function navigateDate(newDate: string) {
    if (pathname.startsWith('/admin/orders/dispatch/')) {
      router.push(`/admin/orders/dispatch/${newDate}`)
    } else {
      router.push(`${pathname}?date=${newDate}`)
    }
  }

  const prevDate = new Date(new Date(currentDate).getTime() - 86400000).toISOString().split('T')[0]
  const nextDate = new Date(new Date(currentDate).getTime() + 86400000).toISOString().split('T')[0]
  const isToday = currentDate === kstToday

  const TABS = [
    {
      href: `/admin/orders?date=${currentDate}`,
      label: '당일발주',
      isActive:
        pathname === '/admin/orders' ||
        (pathname.startsWith('/admin/orders/') &&
          !pathname.startsWith('/admin/orders/dispatch') &&
          !pathname.startsWith('/admin/orders/history')),
    },
    {
      href: `/admin/orders/dispatch/${currentDate}`,
      label: '품목별 발주',
      isActive: pathname.startsWith('/admin/orders/dispatch'),
    },
    {
      href: `/admin/orders/history?date=${currentDate}`,
      label: '총주문내역',
      isActive: pathname.startsWith('/admin/orders/history'),
    },
  ]

  return (
    <div className="flex min-h-[calc(100vh-3rem)]">
      <nav className="w-36 shrink-0 border-r border-gray-200 bg-white p-2 flex flex-col gap-1">
        {TABS.map(tab => (
          <Link
            key={tab.label}
            href={tab.href}
            className={`block px-3 py-3 text-sm font-semibold rounded-lg transition-colors ${
              tab.isActive
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="flex-1 p-5 sm:p-6 min-w-0 overflow-x-hidden">
        {/* 날짜 네비게이션 */}
        <div className="flex items-center gap-2 mb-5">
          <button
            type="button"
            onClick={() => navigateDate(prevDate)}
            className="px-3 py-1.5 bg-gray-100 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-200 text-sm"
          >←</button>
          <input
            type="date"
            value={currentDate}
            max={kstToday}
            onChange={e => { if (e.target.value) navigateDate(e.target.value) }}
            className="bg-gray-100 rounded px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            type="button"
            onClick={() => navigateDate(nextDate)}
            disabled={isToday}
            className="px-3 py-1.5 bg-gray-100 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-sm"
          >→</button>
          {!isToday && (
            <button
              type="button"
              onClick={() => navigateDate(kstToday)}
              className="text-xs text-brand-600 hover:underline ml-1"
            >오늘</button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
