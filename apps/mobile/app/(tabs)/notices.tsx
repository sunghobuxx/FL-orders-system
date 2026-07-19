import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { router } from 'expo-router'

import { supabase } from '@/lib/supabase'

type Notice = { id: string; title: string; created_at: string }
type Inquiry = { id: string; title: string; status: string; created_at: string }

function dateText(value: string) {
  return new Date(value).toLocaleDateString('ko-KR')
}

export default function NoticesScreen() {
  const [tab, setTab] = useState<'notices' | 'inquiries'>('notices')
  const [notices, setNotices] = useState<Notice[]>([])
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchNotices = useCallback(async () => {
    const { data } = await supabase
      .from('notices')
      .select('id, title, created_at')
      .order('created_at', { ascending: false })
    setNotices((data ?? []) as Notice[])
  }, [])

  const fetchInquiries = useCallback(async (organizationId?: string | null) => {
    if (!organizationId) return
    const { data } = await supabase
      .from('inquiries')
      .select('id, title, status, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
    setInquiries((data ?? []) as Inquiry[])
  }, [])

  const getOrganizationId = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase
      .from('memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()
    return data?.organization_id ?? null
  }, [])

  const init = useCallback(async () => {
    const organizationId = await getOrganizationId()
    await Promise.all([fetchNotices(), fetchInquiries(organizationId)])
  }, [fetchInquiries, fetchNotices, getOrganizationId])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await init()
    setRefreshing(false)
  }, [init])

  useEffect(() => {
    init().finally(() => setLoading(false))
  }, [init])

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#16a34a" />
      </View>
    )
  }

  const showingNotices = tab === 'notices'
  const showingInquiries = tab === 'inquiries'

  return (
    <View style={s.container}>
      <View style={s.tabBar}>
        <TouchableOpacity style={[s.tabBtn, showingNotices && s.tabActive]} onPress={() => setTab('notices')}>
          <Text style={[s.tabLabel, showingNotices && s.tabLabelActive]}>공지게시판</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tabBtn, showingInquiries && s.tabActive]} onPress={() => setTab('inquiries')}>
          <Text style={[s.tabLabel, showingInquiries && s.tabLabelActive]}>불편 & 문의</Text>
        </TouchableOpacity>
      </View>

      {showingNotices && (
        <FlatList
          data={notices}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" />}
          contentContainerStyle={s.list}
          ListEmptyComponent={<Text style={s.empty}>공지사항이 없습니다.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/notice/${item.id}` as never)}>
              <Text style={s.title} numberOfLines={2}>{item.title}</Text>
              <View style={s.footer}>
                <Text style={s.date}>{dateText(item.created_at)}</Text>
                <Text style={s.arrow}>›</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {showingInquiries && (
        <FlatList
          data={inquiries}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" />}
          contentContainerStyle={s.list}
          ListHeaderComponent={(
            <TouchableOpacity style={s.writeBtn} onPress={() => router.push('/inquiry/new' as never)}>
              <Text style={s.writeBtnText}>+ 문의 작성</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={s.empty}>등록된 문의가 없습니다.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/inquiry/${item.id}` as never)}>
              <Text style={s.title} numberOfLines={2}>{item.title}</Text>
              <View style={s.footer}>
                <Text style={s.date}>{dateText(item.created_at)}</Text>
                <Text style={[s.badge, item.status === 'answered' ? s.answered : s.pending]}>
                  {item.status === 'answered' ? '답변완료' : '대기중'}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tabBtn: { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#16a34a' },
  tabLabel: { fontSize: 14, color: '#9ca3af', fontWeight: '500' },
  tabLabelActive: { color: '#16a34a', fontWeight: '700' },
  list: { padding: 12, gap: 8 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 14 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  title: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 8, lineHeight: 22 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 12, color: '#9ca3af' },
  arrow: { fontSize: 18, color: '#9ca3af' },
  writeBtn: { backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 4 },
  writeBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  badge: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  answered: { color: '#16a34a', backgroundColor: '#dcfce7' },
  pending: { color: '#92400e', backgroundColor: '#fef9c3' },
})
