import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

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

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: '주문 알림',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#16A34A',
    })
  }

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
  const { data: { session } } = await supabase.auth.getSession()
  if (!session || session.user.id !== userId) throw new Error('로그인 정보를 확인할 수 없습니다.')

  const res = await fetch('https://order.fruitlife.shop/api/mobile/push-token', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? '푸시 토큰 저장에 실패했습니다.')
  }
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
