export const runtime = 'edge'

import type { ReactNode } from 'react'

import { requireAuthorizedAdminDb } from '@/lib/admin-member-user'
import AdminNav from './AdminNav'
import AdminBottomNav from './AdminBottomNav'
import AdminTopHeader from './AdminTopHeader'

/**
 * 어드민 화면 전체의 관문.
 *
 * 페이지마다 검사를 넣는 방식이었는데 실제로 검사하는 페이지는 다섯 곳뿐이었다.
 * 나머지는 createAdminClient 로 바로 조회해서 **로그인 없이도 열렸다** —
 * 대시보드·발주·정산·입출금·회원정보까지 주소만 알면 매출과 미수금이 다 보였다
 * (2026-08-15 확인).
 *
 * 레이아웃은 그 아래 모든 페이지보다 먼저 돌기 때문에, 여기 한 번만 막으면
 * 새 화면을 추가할 때 검사를 빠뜨려도 뚫리지 않는다.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAuthorizedAdminDb()

  return renderShell(children)
}

function renderShell(children: ReactNode) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminNav />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="desk:hidden shrink-0">
          <AdminTopHeader />
        </div>
        <main className="flex-1 overflow-x-hidden pb-16 desk:pb-0">
          {children}
        </main>
      </div>
      <AdminBottomNav />
    </div>
  )
}
