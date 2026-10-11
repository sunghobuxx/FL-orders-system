import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Card, Loading, Muted, colors } from '../../../components'
import { apiDelete, apiGet, apiPost } from '../../../lib/api'
import { nextOrderCheckStage, orderCheckState, pendingOrderCheckIds, orderCheckPresentation } from '../../../lib/order-check'

type DetailResponse = {
  canManage?: boolean
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
    check_stage?: number
    checkStage?: number
  }>
}

export default function OrderDetailScreen() {
  const { batchId } = useLocalSearchParams<{ batchId: string }>()
  const insets = useSafeAreaInsets()
  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [qtys, setQtys] = useState<Record<string, string>>({})
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set())
  const checkInFlight = useRef(false)
  const loadVersion = useRef(0)
  const hasDraft = useRef(false)

  const load = useCallback(async (preserveDraft = false) => {
    if (!batchId) return
    const version = ++loadVersion.current
    const next = await apiGet<DetailResponse>(`/api/driver/orders/${batchId}`)
    if (version !== loadVersion.current) return
    setData(next)
    if (!preserveDraft || !hasDraft.current) {
      setQtys(Object.fromEntries(next.items.map(item => [item.id, String(item.qty)])))
      setPrices(Object.fromEntries(next.items.map(item => [item.id, String(item.unitPrice)])))
      hasDraft.current = false
    }
  }, [batchId])

  useFocusEffect(useCallback(() => {
    load().catch((error) => Alert.alert('발주 상세', error.message)).finally(() => setLoading(false))
    const interval = setInterval(() => {
      if (!checkInFlight.current) void load(true).catch(() => undefined)
    }, 5000)
    return () => clearInterval(interval)
  }, [load]))

  async function refresh() {
    if (checkInFlight.current || saving) return
    setRefreshing(true)
    await load().catch((error) => Alert.alert('새로고침 실패', error.message))
    setRefreshing(false)
  }

  async function checkItems(itemIds: string[], stage: number) {
    if (!data || data.canManage === false || checkInFlight.current || saving || !itemIds.length) return
    const before = data
    checkInFlight.current = true
    ++loadVersion.current
    setCheckingIds(new Set(itemIds))
    setData(current => current && ({ ...current, items: current.items.map(item => itemIds.includes(item.id) ? { ...item, check_stage: stage, checkStage: stage } : item) }))
    try {
      const result = await apiPost<{ batchStatus: string }>('/api/driver/orders/check-items', { batchId: before.batch.id, itemIds, stage })
      const labels: Record<string, string> = { open: '상차시작', submitted: '알림톡발송', validated: '당일발주', ordered: '배송중', dispatched: '배송완료', completed: '배송완료' }
      setData(current => current && ({ ...current, batch: { ...current.batch, status: result.batchStatus, statusLabel: labels[result.batchStatus] ?? current.batch.statusLabel } }))
    } catch (error) {
      setData(before)
      throw error
    } finally {
      checkInFlight.current = false
      setCheckingIds(new Set())
    }
  }

  async function toggle(itemId: string) {
    if (!data) return
    const item = data.items.find(item => item.id === itemId)
    if (!item) return
    const stage = nextOrderCheckStage(data.batch.status, Number(item.check_stage ?? item.checkStage ?? 0))
    if (stage !== null) await checkItems([itemId], stage)
  }

  async function advanceStage() {
    if (!data) return
    await checkItems(pendingOrderCheckIds(data.batch.status, data.items), orderCheckState(data.batch.status).requiredStage)
  }

  async function save() {
    if (!data || checkInFlight.current || saving) return
    ++loadVersion.current
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
      hasDraft.current = false
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
          await load()
        },
      },
    ])
  }

  if (loading) return <Loading />
  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 14, paddingHorizontal: 18 }}>
        <Card><Muted>발주 상세를 불러오지 못했습니다.</Muted></Card>
      </View>
    )
  }

  const canManage = data.canManage !== false
  const { done: isDone, requiredStage, label: checkLabel } = orderCheckState(data.batch.status)
  const confirmed = new Set(data.items
    .filter(item => Number(item.check_stage ?? item.checkStage ?? 0) >= requiredStage)
    .map(item => item.id))
  const total = data.items.length
  const confirmedCount = confirmed.size
  const phase = orderCheckPresentation(data.batch.status)

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
          <View style={{ backgroundColor: phase.background, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: phase.color, fontSize: 12, fontWeight: '900' }}>{data.batch.statusLabel}</Text>
          </View>
        </View>

        <View style={{ borderRadius: 10, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', padding: 12, marginBottom: 12 }}>
          <Text style={{ color: '#1D4ED8', fontSize: 13, fontWeight: '800' }}>
            {canManage ? '수량·단가는 언제든 수정 가능합니다. 수정 저장 시 명세서·정산 금액에 즉시 반영됩니다.' : '다른 담당자 업체의 주문입니다. 상세 내역만 조회할 수 있습니다.'}
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
            const isChecking = checkingIds.has(item.id)
            return (
              <View key={item.id} style={{ gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text numberOfLines={1} style={{ flex: 1.2, color: '#1F2937', fontSize: 13, fontWeight: '800', backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 8, borderRadius: 8 }}>{item.productName}</Text>
                  <View style={{ flex: 1.1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <TextInput editable={canManage}
                      value={qtys[item.id] ?? ''}
                      onChangeText={value => { hasDraft.current = true; setQtys(prev => ({ ...prev, [item.id]: value })) }}
                      keyboardType="decimal-pad"
                      style={{ flex: 1, minHeight: 36, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, textAlign: 'center', color: '#111827', fontWeight: '800' }}
                    />
                    <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '700' }}>{item.unit}</Text>
                  </View>
                  <TextInput editable={canManage}
                    value={prices[item.id] ?? ''}
                    onChangeText={value => { hasDraft.current = true; setPrices(prev => ({ ...prev, [item.id]: value })) }}
                    keyboardType="number-pad"
                    style={{ flex: 1, minHeight: 36, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, textAlign: 'center', color: '#111827', fontWeight: '800' }}
                  />
                  <Pressable
                    onPress={() => toggle(item.id).catch((error) => Alert.alert('확인 실패', error.message))}
                    accessibilityRole="button" accessibilityState={{ checked: isConfirmed, busy: isChecking }}
                    disabled={!canManage || isDone || saving || checkingIds.size > 0}
                    style={{ width: 56, alignItems: 'center', borderRadius: 8, paddingVertical: 9, backgroundColor: isConfirmed ? '#22C55E' : '#16A34A', opacity: 1 }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>{isConfirmed ? '✓' : '확인'}</Text>
                  </Pressable>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Pressable disabled={!canManage || saving || checkingIds.size > 0} style={{ display: canManage ? 'flex' : 'none' }} onPress={() => deleteItem(item.id, item.productName)}>
                    <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '800' }}>삭제</Text>
                  </Pressable>
                </View>
              </View>
            )
          })}

          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '800' }}>{checkLabel}: {confirmedCount} / {total}</Text>
            <View style={{ flex: 1, height: 6, backgroundColor: '#E5E7EB', borderRadius: 999, overflow: 'hidden' }}>
              <View style={{ width: total > 0 ? `${(confirmedCount / total) * 100}%` : '0%', height: 6, backgroundColor: phase.color }} />
            </View>
          </View>
        </Card>

        <View style={{ display: canManage ? 'flex' : 'none', flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginBottom: 14 }}>
          <Pressable onPress={save} disabled={!canManage || saving || checkingIds.size > 0} style={{ backgroundColor: '#1F2937', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12, opacity: saving ? 0.5 : 1 }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>{saving ? '저장 중...' : '수정 저장'}</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canManage || isDone || !total || saving || checkingIds.size > 0, busy: checkingIds.size > 0 }}
          disabled={!canManage || isDone || !total || saving || checkingIds.size > 0}
          onPress={() => void advanceStage().catch(error => Alert.alert('단계 변경 실패', error.message))}
          style={{ borderRadius: 12, borderWidth: 1, borderColor: phase.color, backgroundColor: phase.background, padding: 16, alignItems: 'center', gap: 5 }}
        >
          <Text style={{ color: phase.color, fontSize: 16, fontWeight: '900' }}>{phase.text}{!isDone ? ` (${confirmedCount}/${total})` : ''}</Text>
          {!isDone && <Text style={{ color: phase.color, fontSize: 12 }}>{canManage ? `누르면 전체 확인 후 ${phase.next}으로 전환` : '담당자만 변경할 수 있습니다.'}</Text>}
        </Pressable>
      </ScrollView>
    </View>
  )
}
