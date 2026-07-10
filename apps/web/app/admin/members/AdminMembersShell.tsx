'use client'

import type { ReactNode } from 'react'

export default function AdminMembersShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-full">
      <div className="md:hidden flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200">
        <span className="px-4 py-1.5 rounded-lg text-sm font-medium border bg-gray-800 text-white border-gray-800">
          회원정보
        </span>
      </div>
      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:flex w-36 shrink-0 border-r border-gray-200 flex-col gap-2 p-3 pt-4">
          <div className="block text-center px-2 py-2.5 rounded-lg text-sm font-medium border bg-gray-800 text-white border-gray-800">
            회원정보
          </div>
        </aside>
        <div className="flex-1 min-w-0 p-4 md:p-5">
          {children}
        </div>
      </div>
    </div>
  )
}
