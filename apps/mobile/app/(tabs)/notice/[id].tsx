import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { useLocalSearchParams } from 'expo-router'

import { useNotices } from '@/hooks/use-notices'

/** "1786127264669_FruitLife-Delivery-1.0.3-v5.apk" → "FruitLife-Delivery-1.0.3-v5.apk" */
function fileNameOf(url: string) {
  try {
    const last = decodeURIComponent(url.split('/').pop() ?? '')
    return last.replace(/^\d+_/, '') || '첨부파일'
  } catch {
    return '첨부파일'
  }
}

export default function NoticeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { notices, loading, error, refresh } = useNotices(1, id)
  const notice = notices.find(item => item.id === id)

  if (loading) return <View style={s.center}><ActivityIndicator color="#16a34a" /></View>
  if (error) return <View style={s.center}><Text style={s.empty}>{error}</Text><TouchableOpacity onPress={() => void refresh()}><Text>다시 시도</Text></TouchableOpacity></View>
  if (!notice) return <View style={s.center}><Text style={s.empty}>공지를 찾을 수 없습니다.</Text></View>

  return (
    <ScrollView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>{notice.title}</Text>
        <Text style={s.date}>{new Date(notice.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</Text>
      </View>
      <View style={s.body}>
        <Text style={s.content}>{notice.body}</Text>

        {notice.file_path && (
          <TouchableOpacity
            style={s.attach}
            onPress={async () => {
              const url = notice.file_path!
              // 브라우저로 넘겨 받게 한다. 앱 안에서 받으면 apk·pdf 같은 건 열 수가 없다.
              const ok = await Linking.canOpenURL(url)
              if (!ok) { Alert.alert('첨부파일', '이 파일을 열 수 있는 앱이 없습니다.'); return }
              await Linking.openURL(url)
            }}
          >
            <Text style={s.attachIcon}>📎</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.attachName} numberOfLines={1}>{fileNameOf(notice.file_path)}</Text>
              <Text style={s.attachHint}>눌러서 다운로드</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  title: { fontSize: 18, fontWeight: '700', color: '#111', lineHeight: 26 },
  date: { fontSize: 13, color: '#9ca3af', marginTop: 8 },
  body: { padding: 20 },
  content: { fontSize: 15, color: '#374151', lineHeight: 24 },
  empty: { color: '#9ca3af', fontSize: 14 },
  attach: {
    marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#f9fafb',
  },
  attachIcon: { fontSize: 18 },
  attachName: { fontSize: 14, fontWeight: '600', color: '#111' },
  attachHint: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
})
