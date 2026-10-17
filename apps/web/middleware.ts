import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * 운영 화면(어드민·회원·API)에 no-store 캐시 헤더를 붙인다.
 *
 * next.config.ts의 headers() 를 먼저 썼는데 next-on-pages 빌드에선 적용되지 않았다
 * (운영에서 curl로 확인, cache-control 헤더 자체가 응답에 없었다). middleware 는
 * next-on-pages 가 Cloudflare Pages Functions 로 그대로 변환해 주므로 여기서 건다.
 *
 * Cloudflare CDN 캐시 비우기(zone purge)가 토큰 권한 문제로 배포마다 실패해서
 * (fruitlife.shop zone을 못 찾음, 2026-10-15), 단가·명세서처럼 자주 바뀌는 화면이
 * 캐시된 옛 내용을 계속 보여주는 일이 반복됐다. zone 쪽을 당장 못 고치니
 * 애초에 이 경로들을 캐시 대상에서 뺀다.
 */
function needsNoStore(pathname: string) {
  return pathname.startsWith('/admin') || pathname.startsWith('/member') || pathname.startsWith('/api')
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  await supabase.auth.getUser()

  if (needsNoStore(request.nextUrl.pathname)) {
    response.headers.set('Cache-Control', 'no-store, must-revalidate')
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
