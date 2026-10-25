import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'
import Analytics from './Analytics'

export const metadata: Metadata = {
  title: 'FruitLife 발주 운영 관리 시스템',
  description: 'FruitLife 발주 운영 관리 시스템',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        {/* GTM 권장 배치: JS 꺼진 브라우저를 위한 noscript 폴백은 body 시작부에 둔다. */}
        {process.env.NEXT_PUBLIC_GTM_ID && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${process.env.NEXT_PUBLIC_GTM_ID}`}
              height="0" width="0" style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        )}
        {children}
        <Analytics />
      </body>
    </html>
  )
}
