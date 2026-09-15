import { router } from 'expo-router'
import { Fragment, ReactNode, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native'

import { Loading, Page } from '../../components'
import { useDriverResource } from '../../hooks/useDriverResource'
import { supabase } from '../../lib/supabase'

const STATUS_LABEL: Record<string, string> = { open: '작성 중', submitted: '당일발주', validated: '알림톡 발송', ordered: '배송중', dispatched: '배송완료', completed: '완료' }

type Dashboard = {
  today: string
  tomorrow: string
  role: 'owner' | 'admin' | 'manager'
  assignedRestaurantCount: number | null
  totalAssignedOrders: number
  totalAllOrders: number
  orders: Array<{ id: string; restaurantName: string; status: string; managerNames: string[]; businessDate: string; itemCount: number; submittedAt: string }>
  notes: Array<{ id: string; title: string; created_at: string }>
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
  const [scope, setScope] = useState<'assigned' | 'all'>('assigned')
  const { data, loading, refreshing, refresh, error } = useDriverResource<Dashboard>(
    `/api/driver/dashboard?scope=${scope}`, '대시보드', 5000,
  )
  const twoColumns = width >= 760

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
        {error ? <Text style={{ color: '#DC2626', marginBottom: 12 }}>갱신 실패: {error} · 아래로 당겨 다시 시도해 주세요.</Text> : null}
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
          <CardHeader title="배송 알림" action="전체보기 →" onPress={() => router.push('/notes')} />
          <View style={{ minHeight: 60, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
            {(data?.notes.length ?? 0) === 0 ? (
              <Text style={{ color: '#94A3B8', fontWeight: '800' }}>오늘 배송 알림 없음</Text>
            ) : (
              <View style={{ alignSelf: 'stretch' }}>
                {data?.notes.map((note) => (
                  <Pressable key={note.id} onPress={() => router.push('/notes')} style={{ paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
                    <Text numberOfLines={1} style={{ color: '#111827', fontWeight: '800' }}>{note.title}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </DashboardCard>

        <DashboardCard>
          <CardHeader title="문의/불편" />
          <View style={{ minHeight: 60, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
            {(data?.inquiries.length ?? 0) === 0 ? (
              <Text style={{ color: '#94A3B8', fontWeight: '800' }}>미답변 문의 없음</Text>
            ) : (
              <View style={{ alignSelf: 'stretch' }}>
                {data?.inquiries.slice(0, 3).map((inquiry) => (
                  <View key={inquiry.id} style={{ paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
                    <Text numberOfLines={1} style={{ color: '#111827', fontWeight: '800' }}>{inquiry.title}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </DashboardCard>

        <View style={{ flexDirection: twoColumns ? 'row' : 'column', gap: 24, alignItems: 'stretch' }}>
          <DashboardCard style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, paddingTop: 6 }}>
              <Text style={{ color: '#1F2937', fontSize: 14, fontWeight: '900', flexShrink: 1 }}>주문내역 (식당)</Text>
              <Pressable accessibilityRole="button" onPress={() => setScope(scope === 'assigned' ? 'all' : 'assigned')} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 }}>
                <Text style={{ color: '#00964B', fontSize: 12, fontWeight: '900' }}>{scope === 'all' ? '담당 업체만 보기' : '전체발주보기'}</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 4 }}>
              <Text style={{ color: '#64748B', fontSize: 12 }}>{scope === 'all' ? '전체 업체' : '담당 업체'} · {data?.orders.length ?? 0}건</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/orders')} style={{ minHeight: 36, justifyContent: 'center' }}>
                <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '700' }}>주문내역 →</Text>
              </Pressable>
            </View>
            {(data?.orders.length ?? 0) === 0 ? (
              <EmptyLine text={scope === 'all' ? "전체 업체 주문이 없습니다." : "담당 업체 주문이 없습니다."} />
            ) : (
              data?.orders.map((order, index) => (
                <Fragment key={order.id}>
                  {index === 0 || data.orders[index - 1].businessDate !== order.businessDate ? (
                    <View style={{ backgroundColor: '#EFF6FF', paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
                      <Text style={{ color: '#0067FF', fontWeight: '800', fontSize: 12 }}>배송일 {order.businessDate}</Text>
                    </View>
                  ) : null}
                <Pressable accessibilityRole="button" accessibilityLabel={`${order.restaurantName} 주문 상세`} onPress={() => router.push(`/order/${order.id}`)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#EEF2F7' }}>
                  <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text numberOfLines={1} style={{ flexShrink: 1, color: '#111827', fontSize: 13, fontWeight: '800' }}>{order.restaurantName}</Text>
                    <Text numberOfLines={1} accessibilityLabel={`담당자: ${order.managerNames?.join(', ') || '미지정'}`} style={{ maxWidth: '35%', color: '#64748B', fontSize: 11 }}>{order.managerNames?.join(', ') || '미지정'}</Text>
                  </View>
                  <Text style={{ width: 28, textAlign: 'right', color: '#64748B', fontSize: 13, fontWeight: '800' }}>{order.itemCount}개</Text>
                  <View style={{ backgroundColor: ['dispatched', 'completed'].includes(order.status) ? '#DCFCE7' : '#F3E8FF', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ color: ['dispatched', 'completed'].includes(order.status) ? '#16A34A' : '#8A22E6', fontSize: 12, fontWeight: '900' }}>{STATUS_LABEL[order.status] ?? order.status}</Text>
                  </View>
                </Pressable>
                </Fragment>
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

function CardHeader({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return (
    <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12 }}>
      <Text style={{ color: '#1F2937', fontSize: 14, fontWeight: '900' }}>{title}</Text>
      {action && onPress ? (
        <Pressable onPress={onPress}>
          <Text style={{ color: '#00964B', fontSize: 12, fontWeight: '900' }}>{action}</Text>
        </Pressable>
      ) : null}
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
