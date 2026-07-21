import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native'

import { Card, Empty, Loading, Muted, Page, Pill, colors } from '../../components'
import { apiGet } from '../../lib/api'
import { fmtWon, getKstToday } from '../../lib/format'

type DispatchResponse = {
  businessDate: string
  totalAmount: number
  totals: Array<{ name: string; qty: number; unit: string; qtyText: string; amount: number }>
  suppliers: Array<{
    supplierId: string
    supplierName: string
    status: string
    sent: boolean
    autoDispatchExcluded: boolean
    lines: Array<{ name: string; qty: number; unit: string; qtyText: string; byRestaurantText: string }>
  }>
  unmappedItems: Array<{ name: string; qty: number; unit: string; qtyText: string }>
}

export default function HistoryScreen() {
  const [data, setData] = useState<DispatchResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const targetDate = getKstToday()

  const load = useCallback(async () => {
    const next = await apiGet<DispatchResponse>(`/api/driver/dispatch?date=${targetDate}`)
    setData(next)
  }, [targetDate])

  useFocusEffect(useCallback(() => {
    load().catch((error) => Alert.alert('발주 내역', error.message)).finally(() => setLoading(false))
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
        <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink, marginBottom: 4 }}>발주내역</Text>
        <Muted>웹 관리자 발주내역처럼 품목별 발주 집계와 공급처별 발주 내역을 표시합니다.</Muted>
        <View style={{ height: 14 }} />

        {(data?.totals.length ?? 0) === 0 ? (
          <Empty message={`${targetDate} 발주 내역이 없습니다.`} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: '#374151', fontSize: 14, fontWeight: '900' }}>당일 발주 집계 — {data?.businessDate}</Text>
              {(data?.totalAmount ?? 0) > 0 ? (
                <Text style={{ color: '#374151', fontSize: 13, fontWeight: '900' }}>총 {fmtWon(data?.totalAmount ?? 0)}</Text>
              ) : null}
            </View>

            <Card>
              {data?.totals.map((item, index) => (
                <View key={`${item.name}-${item.unit}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: '#EEF2F7' }}>
                  <Text numberOfLines={1} style={{ flex: 1, color: '#1F2937', fontSize: 14, fontWeight: '800' }}>{item.name}</Text>
                  <View style={{ minWidth: 74, alignItems: 'center', backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ color: '#15803D', fontSize: 13, fontWeight: '900' }}>{item.qtyText}</Text>
                  </View>
                  {item.amount > 0 ? (
                    <Text style={{ minWidth: 76, textAlign: 'right', color: '#64748B', fontSize: 13, fontWeight: '800' }}>{fmtWon(item.amount)}</Text>
                  ) : null}
                </View>
              ))}
              <View style={{ marginHorizontal: -16, marginBottom: -16, marginTop: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F9FAFB', borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
                <Text style={{ color: '#94A3B8', fontSize: 12, fontWeight: '700' }}>총 {data?.totals.length ?? 0}종 품목 · 새벽 2:30 자동 발주</Text>
              </View>
            </Card>

            <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '900', marginTop: 8, marginBottom: 8 }}>공급처별 발주 내역</Text>
            {data?.suppliers.map((supplier) => (
              <Card key={supplier.supplierId}>
                <View style={{ marginHorizontal: -16, marginTop: -16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#EFF6FF', borderBottomWidth: 1, borderBottomColor: '#DBEAFE', borderTopLeftRadius: 18, borderTopRightRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#1E40AF', fontSize: 15, fontWeight: '900' }}>{supplier.supplierName}</Text>
                  <Pill tone={supplier.sent ? 'green' : 'gray'}>
                    {supplier.autoDispatchExcluded ? '자동발송 제외' : supplier.sent ? '전송완료' : '전송대기'}
                  </Pill>
                </View>
                {supplier.lines.map((line, index) => (
                  <View key={`${supplier.supplierId}-${line.name}-${line.unit}`} style={{ paddingVertical: 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: '#EEF2F7' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                      <Text style={{ flex: 1, color: '#1F2937', fontSize: 14, fontWeight: '800' }}>{line.name}</Text>
                      <Text style={{ color: '#4B5563', fontSize: 14, fontWeight: '800' }}>{line.qtyText}</Text>
                    </View>
                    {line.byRestaurantText ? (
                      <Text style={{ marginTop: 3, color: '#94A3B8', fontSize: 12, fontWeight: '700' }}>{line.byRestaurantText}</Text>
                    ) : null}
                  </View>
                ))}
              </Card>
            ))}

            {(data?.unmappedItems.length ?? 0) > 0 ? (
              <Card>
                <Text style={{ color: '#C2410C', fontWeight: '900', marginBottom: 8 }}>⚠ 공급처 미배정 품목</Text>
                {data?.unmappedItems.map((item) => (
                  <View key={`${item.name}-${item.unit}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#FFEDD5' }}>
                    <Text style={{ color: '#1F2937', fontWeight: '800' }}>{item.name}</Text>
                    <Text style={{ color: '#64748B', fontWeight: '800' }}>{item.qtyText}</Text>
                  </View>
                ))}
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </Page>
  )
}
