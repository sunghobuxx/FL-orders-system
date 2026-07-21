import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native'

import { Card, Empty, Loading, Muted, Page, Pill, colors } from '../../components'
import { apiGet } from '../../lib/api'
import { fmtDateTime } from '../../lib/format'

type NotesResponse = {
  notes: Array<{ id: string; title: string; content: string; status: string; created_at: string }>
}

export default function NotesScreen() {
  const [data, setData] = useState<NotesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const next = await apiGet<NotesResponse>('/api/driver/notes')
    setData(next)
  }, [])

  useFocusEffect(useCallback(() => {
    load().catch((error) => Alert.alert('배송 중 전달 사항', error.message)).finally(() => setLoading(false))
  }, [load]))

  async function refresh() {
    setRefreshing(true)
    await load().catch((error) => Alert.alert('새로고침 실패', error.message))
    setRefreshing(false)
  }

  if (loading) return <Loading />

  return (
    <Page>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink, marginBottom: 4 }}>배송 중 전달 사항</Text>
        <Muted>어드민에서 배송매니저에게 전달한 내용입니다.</Muted>
        <View style={{ height: 14 }} />

        {!data?.notes.length ? <Empty message="전달된 내용이 없습니다." /> : data.notes.map((note) => (
          <Card key={note.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: '900', color: colors.ink }}>{note.title}</Text>
              <Pill tone="blue">전달</Pill>
            </View>
            <Muted>{fmtDateTime(note.created_at)}</Muted>
            <View style={{ marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E5E7EB' }}>
              <Text style={{ color: colors.ink, lineHeight: 22, fontSize: 15 }}>{note.content}</Text>
            </View>
          </Card>
        ))}
      </ScrollView>
    </Page>
  )
}
