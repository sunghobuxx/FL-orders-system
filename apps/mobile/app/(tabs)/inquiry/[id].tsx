import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'

interface Inquiry {
  id: string
  title: string
  content: string
  status: string
  created_at: string
  reply?: string | null
  replied_at?: string | null
  image_paths?: string[] | null
}

const STATUS_LABEL: Record<string, string> = {
  open: '대기중',
  pending: '대기중',
  resolved: '답변완료',
  answered: '답변완료',
}
const STATUS_COLOR: Record<string, string> = {
  open: '#f59e0b',
  pending: '#f59e0b',
  resolved: '#16a34a',
  answered: '#16a34a',
}

export default function InquiryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [inquiry, setInquiry] = useState<Inquiry | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('inquiries')
      .select('id, title, content, status, created_at, reply, replied_at, image_paths')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) console.error('Failed to load inquiry:', error)
        setInquiry(data)
        setLoading(false)
      })
  }, [id])

  if (loading) return <View style={s.center}><ActivityIndicator color="#16a34a" /></View>
  if (!inquiry) return <View style={s.center}><Text style={s.empty}>문의를 찾을 수 없습니다.</Text></View>

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* 질문 */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={[s.badge, { backgroundColor: STATUS_COLOR[inquiry.status] + '20' }]}>
            <Text style={[s.badgeText, { color: STATUS_COLOR[inquiry.status] }]}>
              {STATUS_LABEL[inquiry.status] ?? inquiry.status}
            </Text>
          </View>
          <Text style={s.date}>
            {new Date(inquiry.created_at).toLocaleDateString('ko-KR', {
              timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
            }).replace(/\. $/, '')}
          </Text>
        </View>
        <Text style={s.title}>{inquiry.title}</Text>
        <Text style={s.body}>{inquiry.content}</Text>
        {!!inquiry.image_paths?.length && (
          <View style={s.imageGrid}>
            {inquiry.image_paths.map(path => (
              <TouchableOpacity key={path} onPress={() => void Linking.openURL(path)}>
                <Image source={{ uri: path }} style={s.image} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* 답변 */}
      {inquiry.reply ? (
        <View style={[s.card, s.answerCard]}>
          <View style={s.cardHeader}>
            <Text style={s.answerLabel}>📝 관리자 답변</Text>
            {inquiry.replied_at && (
              <Text style={s.date}>
                {new Date(inquiry.replied_at).toLocaleDateString('ko-KR', {
                  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
                }).replace(/\. $/, '')}
              </Text>
            )}
          </View>
          <Text style={s.body}>{inquiry.reply}</Text>
        </View>
      ) : (
        <View style={s.pendingBox}>
          <Text style={s.pendingText}>답변 대기 중입니다.</Text>
        </View>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
  empty: { color: '#9ca3af', fontSize: 14 },
  card: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#e5e7eb', padding: 16, gap: 10,
  },
  answerCard: { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  date: { fontSize: 12, color: '#9ca3af' },
  title: { fontSize: 16, fontWeight: '700', color: '#111', lineHeight: 24 },
  body: { fontSize: 14, color: '#374151', lineHeight: 22 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  image: { width: 94, height: 94, borderRadius: 10, backgroundColor: '#e5e7eb' },
  answerLabel: { fontSize: 13, fontWeight: '700', color: '#16a34a' },
  pendingBox: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1,
    borderColor: '#e5e7eb', padding: 20, alignItems: 'center',
  },
  pendingText: { fontSize: 14, color: '#9ca3af' },
})
