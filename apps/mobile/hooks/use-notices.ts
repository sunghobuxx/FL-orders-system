import { useCallback, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'

export type Notice = {
  id: string
  title: string
  body: string
  created_at: string
  file_path: string | null
}

// 홈 복귀·앱 재개·화면을 켜둔 상태에서도 새 공지를 다시 가져온다.
// 오류는 빈 목록으로 바꾸지 않고 구분해 표시한다.
export function useNotices(limit?: number, id?: string) {
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++generation.current
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) throw new Error('로그인 상태를 확인해주세요.')
      let query = supabase.from('notices')
        .select('id, title, body, created_at, file_path')
        .order('created_at', { ascending: false })
      if (id) query = query.eq('id', id)
      if (limit) query = query.limit(limit)
      const { data, error: queryError } = await query
      if (queryError) throw new Error('공지를 불러오지 못했습니다. 다시 시도해주세요.')
      if (request !== generation.current) return
      setNotices(data ?? [])
      setError(null)
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error ? cause.message : '공지 조회에 실패했습니다.')
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }, [id, limit])

  useFocusEffect(useCallback(() => {
    void refresh()
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh()
    })
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh()
    }, 60_000)
    return () => {
      generation.current += 1
      listener.remove()
      clearInterval(timer)
    }
  }, [refresh]))

  return { notices, loading, error, refresh }
}
