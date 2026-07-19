import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'

interface Inquiry {
  id: string
  title: string
  status: string
  created_at: string
}

const STATUS_LABEL: Record<string, string> = { pending: '대기', answered: '답변' }
const STATUS_COLOR: Record<string, string> = { pending: '#f59e0b', answered: '#16a34a' }

export default function InquiryListScreen() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [inquiries, setInquiries] = useState<Inquiry[]>([])

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/login'); return }

    const { data: membership } = await supabase
      .from('memberships').select('organizations(id)').eq('user_id', session.user.id).single()
    const orgData = membership?.organizations
    const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string } | undefined
    if (!org) { setLoading(false); return }

    const { data } = await supabase
      .from('inquiries')
      .select('id, title, status, created_at')
      .eq('organization_id', org.id)
      .order('created_at', { ascending: false })

    setInquiries(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#16a34a" /></View>

  return (
    <FlatList
      style={s.list}
      data={inquiries}
      keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" />}
      ListHeaderComponent={
        <TouchableOpacity style={s.newBtn} onPress={() => router.push('/(tabs)/inquiry/new')}>
          <Text style={s.newBtnText}>+ 새 문의</Text>
        </TouchableOpacity>
      }
      ListEmptyComponent={
        <View style={s.emptyBox}>
          <Text style={s.emptyText}>문의 내역이 없습니다.</Text>
        </View>
      }
      ItemSeparatorComponent={() => <View style={s.sep} />}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={s.row}
          onPress={() => router.push(`/(tabs)/inquiry/${item.id}`)}
          activeOpacity={0.7}
        >
          <View style={[s.badge, { backgroundColor: STATUS_COLOR[item.status] + '20' }]}>
            <Text style={[s.badgeText, { color: STATUS_COLOR[item.status] }]}>
              {STATUS_LABEL[item.status] ?? item.status}
            </Text>
          </View>
          <Text style={s.title} numberOfLines={1}>{item.title}</Text>
          <Text style={s.date}>
            {new Date(item.created_at).toLocaleDateString('ko-KR', {
              timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
            })}
          </Text>
        </TouchableOpacity>
      )}
    />
  )
}

const s = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
  newBtn: {
    margin: 16, backgroundColor: '#16a34a', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  emptyBox: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: '#9ca3af' },
  sep: { height: 1, backgroundColor: '#f3f4f6' },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    paddingHorizontal: 16, paddingVertical: 14, gap: 10,
  },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  title: { flex: 1, fontSize: 14, color: '#111', fontWeight: '500' },
  date: { fontSize: 11, color: '#9ca3af', flexShrink: 0 },
})
