'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AdminTopHeader() {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-50 h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="FRUIT LIFE" width={28} height={28} className="rounded object-contain brightness-0 invert" />
        <span className="text-sm font-bold text-white tracking-widest">FRUIT LIFE</span>
        <span className="text-xs text-gray-500 hidden sm:block">관리자</span>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="text-xs text-gray-400 hover:text-white px-3 py-1.5 hover:bg-gray-800 rounded transition-colors"
      >
        로그아웃
      </button>
    </header>
  )
}
