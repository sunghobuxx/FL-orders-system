import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'

import { Card, Empty, Loading, Muted, Page, Pill, colors } from '../../components'
import { apiGet } from '../../lib/api'
import { fmtWon } from '../../lib/format'

type SpecsResponse = {
  specs: Array<{
    id: string
    restaurantName: string
    businessDate: string
    totalAmount: number
    itemCount: number
    lines: Array<{ id: string; productName: string; qty: number; unit: string; amount: number }>
  }>
}

export default function SpecsScreen() {
  const [mode, setMode] = useState<'today' | 'history'>('today')
  const [data, setData] = useState<SpecsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const next = await apiGet<SpecsResponse>(`/api/driver/specs?mode=${mode}`)
    setData(next)
  }, [mode])

  useFocusEffect(useCallback(() => {
    setLoading(true)
    load().catch((error) => Alert.alert('명세서', error.message)).finally(() => setLoading(false))
  }, [load]))

  async function refresh() {
    setRefreshing(true)
    await load().catch((error) => Alert.alert('새로고침 실패', error.message))
    setRefreshing(false)
  }

  if (loading) return <Loading />

  return (
    <Page>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink, marginBottom: 4 }}>당일 명세서 / 명세서 내역</Text>
        <Muted>담당 업체 명세서만 표시됩니다.</Muted>
        <View style={{ flexDirection: 'row', gap: 8, marginVertical: 14 }}>
          <Pressable onPress={() => setMode('today')} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: mode === 'today' ? colors.green : colors.soft }}>
            <Text style={{ color: mode === 'today' ? '#FFF' : colors.muted, fontWeight: '900' }}>당일 명세서</Text>
          </Pressable>
          <Pressable onPress={() => setMode('history')} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: mode === 'history' ? colors.green : colors.soft }}>
            <Text style={{ color: mode === 'history' ? '#FFF' : colors.muted, fontWeight: '900' }}>명세서 내역</Text>
          </Pressable>
        </View>
        {!data?.specs.length ? <Empty message="명세서가 없습니다." /> : data.specs.map((spec) => (
          <Card key={spec.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: '900', color: colors.ink }}>{spec.restaurantName}</Text>
              <Pill tone="green">{fmtWon(spec.totalAmount)}</Pill>
            </View>
            <Muted>{spec.businessDate} · {spec.itemCount}개 품목</Muted>
            <View style={{ marginTop: 10 }}>
              {spec.lines.slice(0, 6).map((line) => (
                <View key={line.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line }}>
                  <Text style={{ color: colors.ink, fontWeight: '700' }}>{line.productName}</Text>
                  <Text style={{ color: colors.muted }}>{line.qty}{line.unit} · {fmtWon(line.amount)}</Text>
                </View>
              ))}
            </View>
          </Card>
        ))}
      </ScrollView>
    </Page>
  )
}
