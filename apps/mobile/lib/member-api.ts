export const MEMBER_API_URL = process.env.EXPO_PUBLIC_MEMBER_API_URL ?? 'https://order.fruitlife.shop'

import { supabase } from './supabase'

export async function memberRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('로그인이 필요합니다. 다시 로그인해주세요.')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25000)
  try {
    const response = await fetch(`${MEMBER_API_URL}/api/member${path}`, {
      ...init, signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...init.headers, Authorization: `Bearer ${session.access_token}` },
    })
    const content = await response.text()
    let payload: T & { error?: string }
    try { payload = JSON.parse(content) } catch { throw new Error('서버 응답을 확인하지 못했습니다. 앱에 필요한 API가 배포됐는지 확인해주세요.') }
    if (!response.ok) throw new Error(payload.error ?? '요청 처리에 실패했습니다.')
    return payload
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error(init.method && init.method !== 'GET' ? '응답이 지연되고 있습니다. 중복 저장하지 말고 조회 후 확인해주세요.' : '서버 연결이 지연되고 있습니다. 다시 시도해주세요.')
    throw error
  } finally { clearTimeout(timeout) }
}
