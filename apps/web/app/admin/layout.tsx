export const runtime = 'edge'

import type { ReactNode } from 'react'
import AdminNav from './AdminNav'
import AdminBottomNav from './AdminBottomNav'
import AdminTopHeader from './AdminTopHeader'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminNav />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="lg:hidden shrink-0">
          <AdminTopHeader />
        </div>
        <main className="flex-1 overflow-x-hidden pb-16 lg:pb-0">
          {children}
        </main>
      </div>
      <AdminBottomNav />
    </div>
  )
}
