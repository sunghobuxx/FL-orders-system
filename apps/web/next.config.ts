import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  compress: false,
  serverActions: { bodySizeLimit: '100mb' },
  // 주의: next.config의 env 블록은 빌드 타임에 값을 클라이언트·서버 번들 양쪽에 박아넣는다.
  // 런타임 env(Cloudflare 대시보드 값)로는 덮어쓸 수 없다.
  // 여기 fallback이 Mumbai(구 DB)를 가리키고 있었고, next-on-pages 재빌드 단계에
  // 환경변수가 전달되지 않아 앱 전체가 계속 구 DB로 빌드되고 있었다. (2026-07-26 규명)
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nvpaggacvbotgqyxfdof.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_iYQqjq5q9dN-AwXy-DTYzA_Wnoz0Vw3',
  },
}

export default nextConfig
