export const runtime = 'edge'

import type { ReactNode } from 'react'
import AdminNav from './AdminNav'
import AdminBottomNav from './AdminBottomNav'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminNav />
      <main className="flex-1 min-w-0 overflow-x-hidden pb-16 lg:pb-0">
        {children}
      </main>
      <AdminBottomNav />
    </div>
  )
}
