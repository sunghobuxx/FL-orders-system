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

    // Realtime publication/RLS configuration should not make screens stale.
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
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
