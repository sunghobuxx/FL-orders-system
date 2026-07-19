import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'

import { supabase } from '@/lib/supabase'
import { registerAndSavePushToken } from '@/lib/notifications'

export default function Index() {
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user?.id) {
        await registerAndSavePushToken(session.user.id)
      }
      router.replace(session ? '/(tabs)' : '/login')
    })
  }, [])

  return <View style={styles.center}><ActivityIndicator size="large" color="#16a34a" /></View>
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
})
