import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'

import { Card, Empty, Field, Loading, Muted, Page, colors } from '../../components'
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api'
import { fmtDateTime } from '../../lib/format'
import { getKstToday } from '../../lib/format'

type OrderRow = {
  id: string
  restaurantName: string
  status: string
  statusLabel: string
  businessDate: string
  itemCount: number
  amount: number
  submittedAt: string
}

type OrdersResponse = {
  date: string
  orders: OrderRow[]
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  open: { bg: '#F3F4F6', fg: '#6B7280' },
  submitted: { bg: '#DBEAFE', fg: '#1D4ED8' },
  validated: { bg: '#F3E8FF', fg: '#7E22CE' },
  ordered: { bg: '#FEF3C7', fg: '#B45309' },
  dispatched: { bg: '#DCFCE7', fg: '#16A34A' },
  completed: { bg: '#DCFCE7', fg: '#16A34A' },
}

const NEXT_STATUS: Record<string, { label: string; next: string; primary?: boolean }> = {
  submitted: { label: '→ 알림톡 발송', next: 'validated', primary: true },
  validated: { label: '→ 상차', next: 'ordered' },
  ordered: { label: '→ 배송완료', next: 'dispatched' },
}

export default function OrdersScreen() {
  const [data, setData] = useState<OrdersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editingDateId, setEditingDateId] = useState<string | null>(null)
  const [newDate, setNewDate] = useState(getKstToday())

  const load = useCallback(async () => {
    const next = await apiGet<OrdersResponse>('/api/driver/orders?mode=today')
    setData(next)
  }, [])

  useFocusEffect(useCallback(() => {
    load().catch((error) => Alert.alert('당일 주문', error.message)).finally(() => setLoading(false))
  }, [load]))

  async function refresh() {
    setRefreshing(true)
    await load().catch((error) => Alert.alert('새로고침 실패', error.message))
    setRefreshing(false)
  }

  async function updateStatus(order: OrderRow) {
    const config = NEXT_STATUS[order.status]
    if (!config) return
    await apiPost('/api/driver/orders/status', { batchId: order.id, newStatus: config.next })
    await load()
  }

  async function changeDate(batchId: string) {
    await apiPatch(`/api/driver/orders/${batchId}`, { businessDate: newDate })
    setEditingDateId(null)
    await load()
  }

  function deleteOrder(batchId: string) {
    Alert.alert('발주 삭제', '이 발주를 삭제하시겠습니까? 되돌릴 수 없습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          await apiDelete(`/api/driver/orders/${batchId}`).catch((error) => Alert.alert('삭제 실패', error.message))
          await load()
        },
      },
    ])
  }

  if (loading) return <Loading />

  return (
    <Page>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <View>
            <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink }}>주문내역</Text>
            <Muted>웹 관리자 주문내역과 동일하게 처리합니다.</Muted>
          </View>
          <Text style={{ color: '#64748B', fontSize: 13, fontWeight: '800' }}>총 {data?.orders.length ?? 0}개 업체</Text>
        </View>

        {!data?.orders.length ? <Empty message="발주 없음" /> : data.orders.map((order) => {
          const badge = STATUS_COLORS[order.status] ?? STATUS_COLORS.open
          const next = NEXT_STATUS[order.status]
          const isEditingDate = editingDateId === order.id

          return (
            <Card key={order.id}>
              <Pressable onPress={() => router.push(`/order/${order.id}`)} style={{ marginHorizontal: -16, marginTop: -16, padding: 16, backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#EEF2F7', borderTopLeftRadius: 18, borderTopRightRadius: 18 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '900', color: '#111827' }}>{order.restaurantName}</Text>
                  <Text style={{ color: '#64748B', fontSize: 13, fontWeight: '800' }}>{order.itemCount}개</Text>
                </View>
              </Pressable>

              <View style={{ marginTop: 12, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, color: '#94A3B8', fontSize: 12, fontWeight: '700' }}>{fmtDateTime(order.submittedAt)}</Text>
                  <View style={{ backgroundColor: badge.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ color: badge.fg, fontSize: 12, fontWeight: '900' }}>{order.statusLabel}</Text>
                  </View>
                  {next ? (
                    <Pressable
                      onPress={() => updateStatus(order).catch((error) => Alert.alert('상태 변경 실패', error.message))}
                      style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: next.primary ? '#16A34A' : '#E5E7EB' }}
                    >
                      <Text style={{ color: next.primary ? '#FFFFFF' : '#374151', fontSize: 12, fontWeight: '900' }}>{next.label}</Text>
                    </Pressable>
                  ) : null}
                </View>

                {isEditingDate ? (
                  <View style={{ gap: 8 }}>
                    <Field value={newDate} onChangeText={setNewDate} placeholder="YYYY-MM-DD" />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <SmallButton label="확인" tone="green" onPress={() => changeDate(order.id).catch((error) => Alert.alert('날짜 변경 실패', error.message))} />
                      <SmallButton label="취소" onPress={() => setEditingDateId(null)} />
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <SmallButton label="상세" tone="green" onPress={() => router.push(`/order/${order.id}`)} />
                    <SmallButton label="날짜 변경" onPress={() => { setNewDate(order.businessDate); setEditingDateId(order.id) }} />
                    <SmallButton label="삭제" tone="red" onPress={() => deleteOrder(order.id)} />
                  </View>
                )}
              </View>
            </Card>
          )
        })}
      </ScrollView>
    </Page>
  )
}

function SmallButton({ label, tone = 'gray', onPress }: { label: string; tone?: 'gray' | 'green' | 'red'; onPress: () => void }) {
  const style = tone === 'green'
    ? { bg: '#16A34A', fg: '#FFFFFF' }
    : tone === 'red'
      ? { bg: '#FEF2F2', fg: '#EF4444' }
      : { bg: '#F3F4F6', fg: '#64748B' }
  return (
    <Pressable onPress={onPress} style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: style.bg }}>
      <Text style={{ color: style.fg, fontSize: 12, fontWeight: '900' }}>{label}</Text>
    </Pressable>
  )
}
