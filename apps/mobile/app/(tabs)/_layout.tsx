import { Ionicons } from '@expo/vector-icons'
import { Platform, Pressable } from 'react-native'
import { Tabs, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function TabLayout() {
  const insets = useSafeAreaInsets()
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8)

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#16a34a',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          borderTopColor: '#e5e7eb',
          height: 52 + bottomPadding,
          paddingTop: 6,
          paddingBottom: bottomPadding,
        },
        headerStyle: { backgroundColor: '#fff' },
        headerTitleStyle: { fontWeight: '600', fontSize: 16 },
        headerTintColor: '#111',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '홈', tabBarLabel: '홈',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
          headerRight: () => (
            <Pressable onPress={() => router.push('/profile')} style={{ marginRight: 16 }}>
              <Ionicons name="person-circle-outline" size={26} color="#374151" />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen name="order" options={{ title: '발주', tabBarLabel: '발주', tabBarIcon: ({ color, size }) => <Ionicons name="clipboard-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="settlement" options={{ title: '정산', tabBarLabel: '정산', tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="waiting" options={{ title: '웨이팅', tabBarLabel: '웨이팅', tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="notices" options={{ title: '공지·문의', tabBarLabel: '공지·문의', tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: '내 정보', href: null }} />
      <Tabs.Screen name="notice" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="inquiry" options={{ href: null, headerShown: false }} />
    </Tabs>
  )
}
