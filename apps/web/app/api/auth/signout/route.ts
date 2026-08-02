export const runtime = 'edge'

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

async function signOut(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}

export async function GET(request: NextRequest) {
  return signOut(request)
}

// POST 도 받는다. 로그아웃 버튼이 POST 로 부르는데 GET 만 있어서 405 가 났다.
export async function POST(request: NextRequest) {
  return signOut(request)
}
