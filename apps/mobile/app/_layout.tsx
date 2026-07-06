import { useEffect } from 'react'

import { Stack } from 'expo-router'

import { supabase } from '@/lib/supabase'
import { registerForPushNotifications, savePushToken } from '@/lib/notifications'

export default function RootLayout() {
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        const token = await registerForPushNotifications()
        if (token) {
          await savePushToken(session.user.id, token)
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  )
}
