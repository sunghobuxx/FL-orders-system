import { Stack } from 'expo-router'

export default function InquiryLayout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: '#fff' },
      headerTitleStyle: { fontWeight: '600', fontSize: 16 },
      headerTintColor: '#111',
    }}>
      <Stack.Screen name="index" options={{ title: '문의 내역' }} />
      <Stack.Screen name="new" options={{ title: '문의하기' }} />
      <Stack.Screen name="[id]" options={{ title: '문의 상세' }} />
    </Stack>
  )
}
