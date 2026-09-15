import { useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { Alert, AppState } from 'react-native'
import { apiGet } from '../lib/api'

// Discard responses from an older date/scope or a screen that lost focus.
export function useDriverResource<T>(path: string, title: string, pollMs = 0) {
  const [result, setResult] = useState<{ path: string; data: T } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const request = useRef(0)
  const busy = useRef(false)

  const load = useCallback(async () => {
    const current = generation.current
    const id = ++request.current
    busy.current = true
    try {
      const data = await apiGet<T>(path)
      if (current === generation.current && id === request.current) {
        setResult({ path, data })
        setError(null)
      }
    } catch (e) {
      if (current === generation.current && id === request.current) {
        setError(e instanceof Error ? e.message : '불러오지 못했습니다.')
        throw e
      }
    } finally {
      if (current === generation.current && id === request.current) {
        busy.current = false
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [path])

  useFocusEffect(useCallback(() => {
    generation.current++
    busy.current = false
    setLoading(true)
    setError(null)
    void load().catch(e => Alert.alert(title, e.message))
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void load().catch(() => undefined)
    })
    const timer = pollMs ? setInterval(() => {
      if (!busy.current && AppState.currentState === 'active') void load().catch(() => undefined)
    }, pollMs) : undefined
    return () => {
      generation.current++
      subscription.remove()
      if (timer) clearInterval(timer)
    }
  }, [load, title, pollMs]))

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await load().catch(e => Alert.alert('새로고침 실패', e.message))
  }, [load])

  return { data: result?.path === path ? result.data : null, loading, refreshing, error, load, refresh }
}
