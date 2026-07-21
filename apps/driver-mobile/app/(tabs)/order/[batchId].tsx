import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Card, Loading, Muted, colors } from '../../../components'
import { apiDelete, apiGet, apiPost } from '../../../lib/api'

type DetailResponse = {
  batch: {
    id: string
    status: string
    statusLabel: string
    businessDate: string
    restaurantName: string
  }
  items: Array<{
    id: string
    productId: string
    productName: string
    qty: number
    unit: string
    unitPrice: number
  }>
}

const DONE = ['dispatched', 'completed']

export default function OrderDetailScreen() {
  const { batchId } = useLocalSearchParams<{ batchId: string }>()
  const insets = useSafeAreaInsets()
  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set())
  const [qtys, setQtys] = useState<Record<string, string>>({})
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!batchId) return
    const next = await apiGet<DetailResponse>(`/api/driver/orders/${batchId}`)
    setData(next)
    setQtys(Object.fromEntries(next.items.map(item => [item.id, String(item.qty)])))
    setPrices(Object.fromEntries(next.items.map(item => [item.id, String(item.unitPrice)])))
    if (DONE.includes(next.batch.status)) setConfirmed(new Set())
  }, [batchId])

  useFocusEffect(useCallback(() => {
    load().catch((error) => Alert.alert('발주 상세', error.message)).finally(() => setLoading(false))
  }, [load]))

  async function refresh() {
    setRefreshing(true)
    await load().catch((error) => Alert.alert('새로고침 실패', error.message))
    setRefreshing(false)
  }

  async function toggle(itemId: string) {
    if (!data) return
    const next = new Set(confirmed)
    if (next.has(itemId)) {
      next.delete(itemId)
    } else {
      next.add(itemId)
      if (next.size === 1 && !['ordered', 'dispatched', 'completed'].includes(data.batch.status)) {
        await apiPost('/api/driver/orders/status', { batchId: data.batch.id, newStatus: 'ordered' })
        await load()
      }
    }
    setConfirmed(next)
  }

  async function save() {
    if (!data) return
    setSaving(true)
    try {
      await apiPost('/api/driver/orders/items', {
        batchId: data.batch.id,
        items: data.items.map(item => ({
          id: item.id,
          qty: parseFloat(qtys[item.id] ?? String(item.qty)) || item.qty,
          unit_price_snapshot: parseInt(prices[item.id] ?? String(item.unitPrice), 10) || 0,
        })),
      })
      Alert.alert('저장 완료', '수량·단가가 저장됐습니다.')
      await load()
    } catch (error: any) {
      Alert.alert('저장 실패', error.message)
    } finally {
      setSaving(false)
    }
  }

  function deleteItem(itemId: string, productName: string) {
    if (!data) return
    Alert.alert('품목 삭제', `"${productName}" 품목을 삭제하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          await apiDelete(`/api/driver/orders/items?batchId=${data.batch.id}&itemId=${itemId}`).catch((error) => Alert.alert('삭제 실패', error.message))
          setConfirmed(prev => {
            const next = new Set(prev)
            next.delete(itemId)
            return next
          })
          await load()
        },
      },
    ])
  }

  async function completeDelivery() {
    if (!data) return
    await apiPost('/api/driver/orders/status', { batchId: data.batch.id, newStatus: 'dispatched' })
    Alert.alert('완료', '배송완료 처리됐습니다.')
    await load()
  }

  if (loading) return <Loading />
  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 14, paddingHorizontal: 18 }}>
        <Card><Muted>발주 상세를 불러오지 못했습니다.</Muted></Card>
      </View>
    )
  }

  const isDone = DONE.includes(data.batch.status)
  const total = data.items.length
  const confirmedCount = confirmed.size
  const allConfirmed = confirmedCount === total && total > 0

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 14, paddingHorizontal: 18 }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 94 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: '#94A3B8', fontSize: 14, fontWeight: '900' }}>← 목록</Text>
          </Pressable>
          <Text numberOfLines={1} style={{ flex: 1, color: '#1F2937', fontSize: 15, fontWeight: '900', backgroundColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
            {data.batch.restaurantName}
          </Text>
          <View style={{ backgroundColor: '#DBEAFE', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: '#1D4ED8', fontSize: 12, fontWeight: '900' }}>{data.batch.statusLabel}</Text>
          </View>
        </View>

        <View style={{ borderRadius: 10, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', padding: 12, marginBottom: 12 }}>
          <Text style={{ color: '#1D4ED8', fontSize: 13, fontWeight: '800' }}>
            수량·단가는 언제든 수정 가능합니다. 수정 저장 시 명세서·정산 금액에 즉시 반영됩니다.
          </Text>
        </View>

        <Card>
          <View style={{ flexDirection: 'row', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
            <Text style={{ flex: 1.2, color: '#64748B', fontSize: 12, fontWeight: '900' }}>품목</Text>
            <Text style={{ flex: 1.1, textAlign: 'center', color: '#64748B', fontSize: 12, fontWeight: '900' }}>수량</Text>
            <Text style={{ flex: 1, textAlign: 'center', color: '#64748B', fontSize: 12, fontWeight: '900' }}>단가</Text>
            <Text style={{ width: 56, textAlign: 'center', color: '#64748B', fontSize: 12, fontWeight: '900' }}>확인</Text>
          </View>

          {data.items.map(item => {
            const isConfirmed = confirmed.has(item.id)
            return (
              <View key={item.id} style={{ gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text numberOfLines={1} style={{ flex: 1.2, color: '#1F2937', fontSize: 13, fontWeight: '800', backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 8, borderRadius: 8 }}>{item.productName}</Text>
                  <View style={{ flex: 1.1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <TextInput
                      value={qtys[item.id] ?? ''}
                      onChangeText={value => setQtys(prev => ({ ...prev, [item.id]: value }))}
                      keyboardType="decimal-pad"
                      style={{ flex: 1, minHeight: 36, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, textAlign: 'center', color: '#111827', fontWeight: '800' }}
                    />
                    <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '700' }}>{item.unit}</Text>
                  </View>
                  <TextInput
                    value={prices[item.id] ?? ''}
                    onChangeText={value => setPrices(prev => ({ ...prev, [item.id]: value }))}
                    keyboardType="number-pad"
                    style={{ flex: 1, minHeight: 36, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, textAlign: 'center', color: '#111827', fontWeight: '800' }}
                  />
                  <Pressable
                    onPress={() => toggle(item.id).catch((error) => Alert.alert('확인 실패', error.message))}
                    style={{ width: 56, alignItems: 'center', borderRadius: 8, paddingVertical: 9, backgroundColor: isConfirmed ? '#22C55E' : '#16A34A' }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>{isConfirmed ? '✓' : '확인'}</Text>
                  </Pressable>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Pressable onPress={() => deleteItem(item.id, item.productName)} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '800' }}>삭제</Text>
                  </Pressable>
                </View>
              </View>
            )
          })}

          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '800' }}>확인 완료: {confirmedCount} / {total}</Text>
            <View style={{ flex: 1, height: 6, backgroundColor: '#E5E7EB', borderRadius: 999, overflow: 'hidden' }}>
              <View style={{ width: total > 0 ? `${(confirmedCount / total) * 100}%` : '0%', height: 6, backgroundColor: '#22C55E' }} />
            </View>
          </View>
        </Card>

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginBottom: 14 }}>
          <Pressable onPress={save} disabled={saving} style={{ backgroundColor: '#1F2937', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12, opacity: saving ? 0.5 : 1 }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>{saving ? '저장 중...' : '수정 저장'}</Text>
          </Pressable>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          {isDone ? (
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: '#BBF7D0', backgroundColor: '#F0FDF4', paddingHorizontal: 18, paddingVertical: 12 }}>
              <Text style={{ color: '#16A34A', fontWeight: '900' }}>배송완료 처리됨</Text>
            </View>
          ) : allConfirmed ? (
            <Pressable onPress={() => completeDelivery().catch((error) => Alert.alert('배송완료 실패', error.message))} style={{ backgroundColor: '#16A34A', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12 }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>② 배송완료</Text>
            </Pressable>
          ) : (
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', paddingHorizontal: 18, paddingVertical: 12 }}>
              <Text style={{ color: '#94A3B8', fontWeight: '900' }}>배송중 ({confirmedCount}/{total} 확인)</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}
