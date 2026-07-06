import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'

import { useLocalSearchParams } from 'expo-router'

import { supabase } from '@/lib/supabase'

interface Notice {
  id: string
  title: string
  content: string
  created_at: string
}

export default function NoticeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [notice, setNotice] = useState<Notice | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('notices').select('id, title, content, created_at').eq('id', id).single()
      .then(({ data }) => { setNotice(data); setLoading(false) })
  }, [id])

  if (loading) return <View style={s.center}><ActivityIndicator color="#16a34a" /></View>
  if (!notice) return <View style={s.center}><Text style={s.empty}>공지를 찾을 수 없습니다.</Text></View>

  return (
    <ScrollView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>{notice.title}</Text>
        <Text style={s.date}>{new Date(notice.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</Text>
      </View>
      <View style={s.body}>
        <Text style={s.content}>{notice.content}</Text>
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
})
