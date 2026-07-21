import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'

import { colors } from '../../components'

const ICONS = {
  index: ['home-outline', 'home'] as const,
  orders: ['clipboard-outline', 'clipboard'] as const,
  history: ['cube-outline', 'cube'] as const,
  specs: ['receipt-outline', 'receipt'] as const,
  notes: ['chatbubble-ellipses-outline', 'chatbubble-ellipses'] as const,
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTitleAlign: 'center',
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
          borderTopColor: '#E5E7EB',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '대시보드', tabBarLabel: '홈', tabBarIcon: icon('index') }} />
      <Tabs.Screen name="orders" options={{ title: '당일 주문', tabBarLabel: '주문', tabBarIcon: icon('orders') }} />
      <Tabs.Screen name="history" options={{ title: '발주 내역', tabBarLabel: '발주', tabBarIcon: icon('history') }} />
      <Tabs.Screen name="specs" options={{ title: '명세서', tabBarLabel: '명세서', tabBarIcon: icon('specs') }} />
      <Tabs.Screen name="notes" options={{ title: '배송 중 전달 사항', tabBarLabel: '전달', tabBarIcon: icon('notes') }} />
      <Tabs.Screen
        name="order/[batchId]"
        options={{
          href: null,
          headerShown: false,
          tabBarStyle: {
            height: 64,
            paddingTop: 6,
            paddingBottom: 8,
            borderTopColor: '#E5E7EB',
          },
        }}
      />
    </Tabs>
  )
}

function icon(name: keyof typeof ICONS) {
  return ({ color, focused, size }: { color: string; focused: boolean; size: number }) => (
    <Ionicons name={focused ? ICONS[name][1] : ICONS[name][0]} color={color} size={size + 2} />
  )
}
