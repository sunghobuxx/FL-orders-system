'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type NavSection = { type: 'section'; label: string }
type NavLink = { href: string; label: string; exact?: boolean }
type NavItem = NavSection | NavLink

const NAV_ITEMS: NavItem[] = [
  { href: '/admin/dashboard', label: '대시보드', exact: true },
  { href: '/admin/orders', label: '발주 통합' },
  { href: '/admin/orders/direct', label: '직접 발주 입력' },
  { href: '/admin/products', label: '품목 마스터' },
  { href: '/admin/suppliers', label: '공급처 관리' },
  { type: 'section', label: '정산' },
  { href: '/admin/settlement/specs', label: '당일명세서' },
  { href: '/admin/settlement', label: '주/월 정산' },
  { href: '/admin/finance', label: '입/출금(미수금)' },
  { href: '/admin/purchase', label: '매입 정산' },
  { href: '/admin/sales', label: '전체 매출관리' },
  { type: 'section', label: '운영' },
  { href: '/admin/waiting', label: '웨이팅 현황' },
  { href: '/admin/push', label: '푸쉬메시지 설정' },
  { href: '/admin/notices', label: '공지 관리' },
  { href: '/admin/inquiries', label: '문의/불편' },
  { href: '/admin/members', label: '회원정보' },
  { href: '/admin/accounts', label: '관리자 계정' },
]

export default function AdminNav() {
  const pathname = usePathname()
  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <nav className="hidden lg:flex w-[200px] shrink-0 bg-gray-900 flex-col h-screen sticky top-0 overflow-hidden">
      {/* Logo */}
      <Link href="/admin/dashboard" className="px-4 py-4 border-b border-gray-800 flex items-center gap-2.5 hover:bg-gray-800 transition-colors">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="FRUIT LIFE" width={32} height={32} className="rounded object-contain brightness-0 invert" />
        <div>
          <p className="text-base font-bold text-white leading-none tracking-widest">FRUIT LIFE</p>
          <p className="text-xs text-gray-400 leading-none mt-1">관리자</p>
        </div>
      </Link>

      {/* Nav Items */}
      <div className="flex-1 py-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          if ('type' in item) {
            return (
              <div key={`section-${item.label}`} className="px-4 pt-4 pb-1.5">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{item.label}</p>
              </div>
            )
          }
          const isActive = item.exact
            ? pathname === item.href
            : item.href === '/admin/orders'
            ? pathname.startsWith('/admin/orders') && !pathname.startsWith('/admin/orders/direct')
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-gray-800 text-white font-semibold border-l-2 border-brand-500'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>

      {/* Logout */}
      <div className="p-3 border-t border-gray-800">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full text-left px-4 py-2.5 text-sm text-gray-500 hover:text-white hover:bg-gray-800 rounded transition-colors"
        >
          로그아웃
        </button>
      </div>
    </nav>
  )
}
