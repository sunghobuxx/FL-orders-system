'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'

export default function OrderLiveRefresh({ batchId }: { batchId?: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => router.refresh(), 150)
    }

    const channel = supabase
      .channel(`admin-orders:${batchId ?? 'list'}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'order_batches',
        ...(batchId ? { filter: `id=eq.${batchId}` } : {}),
      }, refresh)

    if (batchId) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, refresh)
    }
    channel.subscribe()

    // Realtime 설정이 어긋나도 화면이 굳지 않게 주기적으로도 새로고침한다.
    //
    // 다만 **입력 중일 때는 건너뛴다.** 5 초마다 무조건 새로고침하면 수량·단가를
    // 치는 도중에 서버 값으로 되돌아가고, 체크를 누른 직후에도 풀렸다
    // (2026-08-18 확인). 화면을 보고 있으면서 아무것도 안 만지는 동안만 돈다.
    const isBusy = () => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
          || el instanceof HTMLSelectElement) return true
      return document.querySelector('[data-live-refresh="pause"]') !== null
    }
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !isBusy()) router.refresh()
    }, 5000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [batchId, router])

  return null
}
