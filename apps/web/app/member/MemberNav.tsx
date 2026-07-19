'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/member/notices', label: '공지', match: (p: string) => p.startsWith('/member/notices') || p.startsWith('/member/inquiries') },
  { href: '/member/order', label: '발주', match: (p: string) => p.startsWith('/member/order') },
  { href: '/member/settlement', label: '정산', match: (p: string) => p.startsWith('/member/settlement') || p.startsWith('/member/spec') },
  { href: '/member/profile', label: '회원정보', match: (p: string) => p.startsWith('/member/profile') },
]

export default function MemberNav() {
  const pathname = usePathname()

  async function handleLogout() {
    await fetch('/api/auth/signout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-300">
      <div className="flex items-center h-14 px-3 md:px-6 gap-2 md:gap-4">
        <Link href="/member/dashboard" className="shrink-0 hover:opacity-80 transition-opacity mr-1 md:mr-4">
          <div className="flex flex-col items-center md:hidden">
            <img src="/logo.png" alt="FruitLife" width={28} height={28} />
          </div>
          <div className="hidden md:flex items-center gap-2">
            <img src="/logo.png" alt="FruitLife" width={32} height={32} />
            <span className="font-bold text-gray-900 tracking-tight">FRUIT LIFE</span>
          </div>
        </Link>
        <nav className="flex items-center gap-1 flex-1 overflow-x-auto min-w-0">
          {NAV.map(item => {
            const active = item.match(pathname)
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                  active
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <button
          type="button"
          onClick={handleLogout}
          className="shrink-0 text-xs md:text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg px-2 md:px-3 py-1.5"
        >
          로그아웃
        </button>
      </div>
    </header>
  )
}
