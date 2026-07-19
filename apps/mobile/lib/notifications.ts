import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'

import { supabase } from './supabase'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== 'granted') return null

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId

  if (!projectId) {
    console.warn('[Push] Expo project ID not found in app config')
    return null
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })
  return token
}

export async function savePushToken(userId: string, token: string) {
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { user_id: userId, token, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  if (error) console.error('[Push] Failed to save token:', error.message)
}

export async function registerAndSavePushToken(userId: string) {
  try {
    const token = await registerForPushNotifications()
    if (!token) return null
    await savePushToken(userId, token)
    return token
  } catch (error) {
    console.error('[Push] Failed to register push token:', error)
    return null
  }
}
