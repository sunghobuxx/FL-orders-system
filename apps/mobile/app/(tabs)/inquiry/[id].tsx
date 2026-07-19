import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'

interface Inquiry {
  id: string
  title: string
  content: string
  status: string
  created_at: string
  answer?: string | null
  answered_at?: string | null
}

const STATUS_LABEL: Record<string, string> = { pending: '대기중', answered: '답변완료' }
const STATUS_COLOR: Record<string, string> = { pending: '#f59e0b', answered: '#16a34a' }

export default function InquiryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [inquiry, setInquiry] = useState<Inquiry | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('inquiries')
      .select('id, title, content, status, created_at, answer, answered_at')
      .eq('id', id)
      .single()
      .then(({ data }) => { setInquiry(data); setLoading(false) })
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
      </View>

      {/* 답변 */}
      {inquiry.answer ? (
        <View style={[s.card, s.answerCard]}>
          <View style={s.cardHeader}>
            <Text style={s.answerLabel}>📝 관리자 답변</Text>
            {inquiry.answered_at && (
              <Text style={s.date}>
                {new Date(inquiry.answered_at).toLocaleDateString('ko-KR', {
                  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
                }).replace(/\. $/, '')}
              </Text>
            )}
          </View>
          <Text style={s.body}>{inquiry.answer}</Text>
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
  answerLabel: { fontSize: 13, fontWeight: '700', color: '#16a34a' },
  pendingBox: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1,
    borderColor: '#e5e7eb', padding: 20, alignItems: 'center',
  },
  pendingText: { fontSize: 14, color: '#9ca3af' },
})
