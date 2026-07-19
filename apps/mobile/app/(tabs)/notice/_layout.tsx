import { Stack } from 'expo-router'

export default function NoticeLayout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: '#fff' },
      headerTitleStyle: { fontWeight: '600', fontSize: 16 },
      headerTintColor: '#111',
    }}>
      <Stack.Screen name="[id]" options={{ title: '공지 상세' }} />
    </Stack>
  )
}
