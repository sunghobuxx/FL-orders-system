import { router } from 'expo-router'
import { ReactNode, useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native'

import { Loading, Page } from '../../components'
import { apiGet } from '../../lib/api'
import { supabase } from '../../lib/supabase'

type Dashboard = {
  today: string
  tomorrow: string
  role: 'admin' | 'manager'
  assignedRestaurantCount: number | null
  totalAssignedOrders: number
  totalAllOrders: number
  orders: Array<{ id: string; restaurantName: string; status: string; businessDate: string; itemCount: number; submittedAt: string }>
  inquiries: Array<{ id: string; title: string; status: string; created_at: string }>
  dispatches: Array<{
    id: string
    supplierName: string
    businessDate: string
    status: string
    sent: boolean
    items: Array<{ name: string; qty: number; unit: string }>
  }>
}

export default function DashboardScreen() {
  const { width } = useWindowDimensions()
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const twoColumns = width >= 760

  const load = useCallback(async () => {
    const dashboard = await apiGet<Dashboard>('/api/driver/dashboard')
    setData(dashboard)
  }, [])

  useEffect(() => {
    load().catch((error) => Alert.alert('대시보드', error.message)).finally(() => setLoading(false))
  }, [load])

  async function refresh() {
    setRefreshing(true)
    await load().catch((error) => Alert.alert('새로고침 실패', error.message))
    setRefreshing(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) return <Loading />

  return (
    <Page>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 28 }}
      >
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#111827', letterSpacing: -0.4 }}>대시보드</Text>
              <Text style={{ marginTop: 6, color: '#8190A5', fontSize: 13, fontWeight: '600' }}>
                {data?.today} 기준 · 오늘({data?.today}) + 내일({data?.tomorrow}) 발주 표시
              </Text>
            </View>
            <Pressable onPress={signOut} style={{ paddingVertical: 4 }}>
              <Text style={{ color: '#94A3B8', fontSize: 12, fontWeight: '800' }}>로그아웃</Text>
            </Pressable>
          </View>
        </View>

        <DashboardCard>
          <CardHeader title="배송 중 전달 사항" action="전체보기 →" onPress={() => router.push('/notes')} />
          <View style={{ minHeight: 60, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
            {(data?.inquiries.length ?? 0) === 0 ? (
              <Text style={{ color: '#94A3B8', fontWeight: '800' }}>미답변 문의 없음</Text>
            ) : (
              <View style={{ alignSelf: 'stretch' }}>
                {data?.inquiries.slice(0, 3).map((inq) => (
                  <Pressable key={inq.id} style={{ paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
                    <Text numberOfLines={1} style={{ color: '#111827', fontWeight: '800' }}>{inq.title}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </DashboardCard>

        <View style={{ flexDirection: twoColumns ? 'row' : 'column', gap: 24, alignItems: 'stretch' }}>
          <DashboardCard style={{ flex: 1 }}>
            <CardHeader title="주문내역 (식당)" action="전체보기 →" onPress={() => router.push('/orders')} />
            <View style={{ backgroundColor: '#EFF6FF', paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
              <Text style={{ color: '#0067FF', fontWeight: '900', fontSize: 13 }}>오늘 배송 ({data?.today})</Text>
            </View>
            {(data?.orders.length ?? 0) === 0 ? (
              <EmptyLine text="담당 업체 주문이 없습니다." />
            ) : (
              data?.orders.map((order) => (
                <View key={order.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#EEF2F7' }}>
                  <Text numberOfLines={1} style={{ flex: 1, color: '#111827', fontSize: 14, fontWeight: '800' }}>{order.restaurantName}</Text>
                  <Text style={{ width: 36, textAlign: 'right', color: '#64748B', fontSize: 13, fontWeight: '800' }}>{order.itemCount}개</Text>
                  <Pressable style={{ backgroundColor: '#F3E8FF', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ color: '#8A22E6', fontSize: 12, fontWeight: '900' }}>상차시작</Text>
                  </Pressable>
                </View>
              ))
            )}
          </DashboardCard>

          <DashboardCard style={{ flex: 1 }}>
            <CardHeader title="발주내역 (농산물)" action="전체보기 →" onPress={() => router.push('/history')} />
            <Text style={{ color: '#94A3B8', fontSize: 12, fontWeight: '700', marginTop: -8, marginBottom: 12, paddingHorizontal: 18 }}>
              새벽 02:30 문자 발송 대상
            </Text>
            {(data?.dispatches.length ?? 0) === 0 ? (
              <EmptyLine text="발주 대상 농산물이 없습니다." />
            ) : (
              data?.dispatches.map((dispatch) => (
                <View key={dispatch.id} style={{ paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#EEF2F7' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={{ color: '#0057FF', fontWeight: '900', fontSize: 15 }}>{dispatch.supplierName}</Text>
                    <View style={{ backgroundColor: dispatch.sent ? '#DCFCE7' : '#F3F4F6', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: dispatch.sent ? '#16A34A' : '#64748B', fontSize: 11, fontWeight: '900' }}>
                        {dispatch.sent ? '전송완료' : '전송대기'}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {dispatch.items.map((item) => (
                      <View key={`${dispatch.id}-${item.name}-${item.unit}`} style={{ backgroundColor: '#EAF2FF', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ color: '#0057D9', fontSize: 12, fontWeight: '900' }}>
                          {item.name} {formatQty(item.qty)}{item.unit}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))
            )}
          </DashboardCard>
        </View>
      </ScrollView>
    </Page>
  )
}

function DashboardCard({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <View style={[{
      backgroundColor: '#FFFFFF',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#E1E6EE',
      overflow: 'hidden',
      marginBottom: 24,
    }, style]}>
      {children}
    </View>
  )
}

function CardHeader({ title, action, onPress }: { title: string; action: string; onPress: () => void }) {
  return (
    <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12 }}>
      <Text style={{ color: '#1F2937', fontSize: 14, fontWeight: '900' }}>{title}</Text>
      <Pressable onPress={onPress}>
        <Text style={{ color: '#00964B', fontSize: 12, fontWeight: '900' }}>{action}</Text>
      </Pressable>
    </View>
  )
}

function EmptyLine({ text }: { text: string }) {
  return (
    <View style={{ minHeight: 86, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
      <Text style={{ color: '#94A3B8', fontWeight: '800' }}>{text}</Text>
    </View>
  )
}

function formatQty(qty: number) {
  return Number.isInteger(qty) ? String(qty) : String(Number(qty.toFixed(1)))
}
