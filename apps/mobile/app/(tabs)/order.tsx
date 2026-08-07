import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import { supabase } from '@/lib/supabase'
import { MEMBER_API_URL } from '@/lib/member-api'

type Product = { id: string; standard_name: string; default_unit: string; category: string | null }
type Batch = { id: string; business_date: string; status: string }
type BatchState = { batch: Batch | null; businessDate: string; quantities: Record<string, string> }
type BatchItem = { product_name: string; qty: number; unit: string }

const STEPS = [
  { key: 'submitted', label: '발주접수' },
  { key: 'validated', label: '알림톡발송' },
  { key: 'ordered', label: '배송중' },
  { key: 'dispatched', label: '배송완료' },
]

const STATUS_LABELS: Record<string, string> = {
  open: '작성 중',
  submitted: '당일발주',
  validated: '알림톡 발송',
  ordered: '배송중',
  dispatched: '배송완료',
  completed: '완료',
}

const STATUS_COLORS: Record<string, string> = {
  open: '#f59e0b',
  submitted: '#3b82f6',
  validated: '#8b5cf6',
  ordered: '#0ea5e9',
  dispatched: '#16a34a',
  completed: '#6b7280',
}

const CATEGORY_LABELS: Record<string, string> = {
  vegetable: '채소',
  fruit: '과일',
  grain: '곡류',
  meat: '육류',
  seafood: '수산',
  dairy: '유제품',
  seasoning: '양념',
  etc: '기타',
}

const CATEGORY_EMOJI: Record<string, string> = {
  vegetable: '🥬',
  fruit: '🍎',
  grain: '🌾',
  meat: '🥩',
  seafood: '🐟',
  dairy: '🥛',
  seasoning: '🧄',
  etc: '📦',
}

const CATEGORY_ORDER = ['vegetable', 'fruit', 'grain', 'meat', 'seafood', 'dairy', 'seasoning', 'etc']

function todayKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
}

function tomorrowKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
}

function isAfterOrderCutoff() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return now.getUTCHours() * 60 + now.getUTCMinutes() >= 240
}

function statusStep(status?: string | null) {
  if (!status) return -1
  return STEPS.findIndex((step) => step.key === status)
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default function OrderScreen() {
  const [tab, setTab] = useState<'form' | 'status' | 'history'>('form')
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [selectedCategory, setSelectedCategory] = useState('vegetable')
  const [unitPrices, setUnitPrices] = useState<Record<string, number>>({})
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [todayBatch, setTodayBatch] = useState<Batch | null>(null)
  const [businessDate, setBusinessDate] = useState(todayKst())
  const activeBatchRef = useRef<Batch | null>(null)
  const activeDateRef = useRef(businessDate)
  const [history, setHistory] = useState<Batch[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null)
  const [batchItems, setBatchItems] = useState<Record<string, BatchItem[]>>({})
  const fetchedItemBatches = useRef(new Set<string>())

  const loadProducts = useCallback(async (restId: string) => {
    const { data: rows } = await supabase
      .from('restaurant_products')
      .select('products(id, standard_name, default_unit, category)')
      .eq('restaurant_id', restId)
      .order('display_order')

    return (rows ?? [])
      .map((row) => unwrapRelation<Product>(row.products))
      .filter(Boolean) as Product[]
  }, [])

  const loadUnitPrices = useCallback(async (restId: string, date: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return {}

    try {
      const params = new URLSearchParams({ restaurantId: restId, businessDate: date })
      const response = await fetch(`${MEMBER_API_URL}/api/member/product-prices?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const payload = await response.json() as { prices?: Record<string, number>; error?: string }
      if (!response.ok) throw new Error(payload.error ?? '단가를 불러오지 못했습니다.')
      return payload.prices ?? {}
    } catch (error) {
      // 단가 API가 잠시 끊겨도 Expo 개발 오류 화면이 발주 화면을 덮지 않게 한다.
      // 목록은 계속 사용할 수 있고, 새로고침 시 단가를 다시 조회한다.
      if (__DEV__) console.log('Failed to load unit prices:', error)
      return {}
    }
  }, [])

  const loadToday = useCallback(async (restId: string): Promise<BatchState> => {
    const today = todayKst()
    const { data: currentBatch } = await supabase
      .from('order_batches')
      .select('id, business_date, status')
      .eq('restaurant_id', restId)
      .eq('business_date', today)
      .maybeSingle()

    const targetDate =
      (currentBatch && !['open', 'submitted'].includes(currentBatch.status)) || isAfterOrderCutoff()
        ? tomorrowKst()
        : today

    const { data: targetBatch } = targetDate === today
      ? { data: currentBatch }
      : await supabase
        .from('order_batches')
        .select('id, business_date, status')
        .eq('restaurant_id', restId)
        .eq('business_date', targetDate)
        .maybeSingle()

    const qtyMap: Record<string, string> = {}
    if (targetBatch) {
      const { data: order } = await supabase
        .from('orders')
        .select('id')
        .eq('batch_id', targetBatch.id)
        .maybeSingle()

      if (order) {
        const { data: items } = await supabase
          .from('order_items')
          .select('product_id, qty')
          .eq('order_id', order.id)

        for (const item of items ?? []) {
          qtyMap[item.product_id] = String(item.qty)
        }
      }
    }

    return { batch: targetBatch as Batch | null, businessDate: targetDate, quantities: qtyMap }
  }, [])

  const loadHistory = useCallback(async (restId: string) => {
    const { data } = await supabase
      .from('order_batches')
      .select('id, business_date, status')
      .eq('restaurant_id', restId)
      .order('business_date', { ascending: false })
      .limit(30)

    return (data ?? []) as Batch[]
  }, [])

  const reload = useCallback(async (restId: string) => {
    const [productRows, current, batches] = await Promise.all([
      loadProducts(restId),
      loadToday(restId),
      loadHistory(restId),
    ])
    const prices = await loadUnitPrices(restId, current.businessDate)
    setProducts(productRows)
    setUnitPrices(prices)
    activeBatchRef.current = current.batch
    activeDateRef.current = current.businessDate
    setTodayBatch(current.batch)
    setBusinessDate(current.businessDate)
    setQuantities(current.quantities)
    setHistory(batches)
  }, [loadHistory, loadProducts, loadToday, loadUnitPrices])

  const syncActiveOrder = useCallback(async (restId: string) => {
    const current = await loadToday(restId)
    const previous = activeBatchRef.current
    const changed =
      current.businessDate !== activeDateRef.current ||
      current.batch?.id !== previous?.id ||
      current.batch?.status !== previous?.status

    if (!changed) return

    activeBatchRef.current = current.batch
    activeDateRef.current = current.businessDate
    setTodayBatch(current.batch)
    setBusinessDate(current.businessDate)
    setQuantities(current.quantities)
    setUnitPrices(await loadUnitPrices(restId, current.businessDate))
  }, [loadToday, loadUnitPrices])

  const loadBatchItems = useCallback(async (batchId: string) => {
    if (batchItems[batchId]) return

    const { data: order } = await supabase
      .from('orders')
      .select('id')
      .eq('batch_id', batchId)
      .maybeSingle()

    if (!order) {
      setBatchItems((prev) => ({ ...prev, [batchId]: [] }))
      return
    }

    const { data: items } = await supabase
      .from('order_items')
      .select('qty, unit, products(standard_name)')
      .eq('order_id', order.id)

    const mapped = (items ?? []).map((item) => {
      const product = unwrapRelation<{ standard_name: string }>(item.products)
      return {
        product_name: product?.standard_name ?? '알 수 없음',
        qty: Number(item.qty),
        unit: item.unit,
      }
    })

    setBatchItems((prev) => ({ ...prev, [batchId]: mapped }))
  }, [batchItems])

  const toggleBatch = useCallback(async (batchId: string) => {
    if (expandedBatch !== batchId) {
      setExpandedBatch(batchId)
      if (!fetchedItemBatches.current.has(batchId)) {
        await loadBatchItems(batchId)
        fetchedItemBatches.current.add(batchId)
      }
    } else {
      setExpandedBatch(null)
    }
  }, [expandedBatch, loadBatchItems])

  const onRefresh = useCallback(async () => {
    if (!restaurantId) return
    setRefreshing(true)
    await reload(restaurantId)
    setRefreshing(false)
  }, [reload, restaurantId])

  const handleSubmit = useCallback(async () => {
    if (!restaurantId) return

    const selected = products.filter((product) => {
      const qty = quantities[product.id]
      return qty && Number(qty) > 0
    })

    if (selected.length === 0) {
      Alert.alert('알림', '수량을 입력해주세요.')
      return
    }

    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')

      const items = selected.map((product) => ({
        product_id: product.id,
        qty: Number(quantities[product.id]),
        unit: product.default_unit,
        unit_price_snapshot: unitPrices[product.id] ?? 0,
        memo: '',
      }))

      const response = await fetch(`${MEMBER_API_URL}/api/member/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          restaurantId,
          businessDate,
          batchId: todayBatch?.id ?? null,
          items,
          isSubmit: true,
        }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? '발주 제출에 실패했습니다.')

      Alert.alert('발주 완료', '발주가 제출되었습니다.', [
        {
          text: '확인',
          onPress: () => {
            setTab('status')
            void reload(restaurantId)
          },
        },
      ])
    } catch (error) {
      Alert.alert('오류', error instanceof Error ? error.message : '발주 제출에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }, [businessDate, products, quantities, reload, restaurantId, todayBatch, unitPrices])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: membership } = await supabase
        .from('memberships')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!membership?.organization_id) return

      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('id')
        .eq('organization_id', membership.organization_id)
        .maybeSingle()

      if (!restaurant?.id) return

      setRestaurantId(restaurant.id)
      await reload(restaurant.id)
    }

    init().finally(() => setLoading(false))
  }, [reload])

  useFocusEffect(useCallback(() => {
    if (!restaurantId) return

    void reload(restaurantId)
    const interval = setInterval(() => {
      void syncActiveOrder(restaurantId)
    }, 30_000)

    return () => clearInterval(interval)
  }, [reload, restaurantId, syncActiveOrder]))

  const availableCategories = useMemo(() => {
    const productCategories = [...new Set(products.map((product) => product.category ?? 'etc'))]
    const known = CATEGORY_ORDER.filter((category) => productCategories.includes(category))
    const extra = productCategories.filter((category) => !CATEGORY_ORDER.includes(category)).sort()
    return [...known, ...extra]
  }, [products])

  useEffect(() => {
    if (availableCategories.length > 0 && !availableCategories.includes(selectedCategory)) {
      setSelectedCategory(availableCategories[0])
    }
  }, [availableCategories, selectedCategory])

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#16a34a" size="large" />
      </View>
    )
  }

  const selectedProducts = products.filter((product) => {
    const qty = quantities[product.id]
    return qty && Number(qty) > 0
  })
  const categoryProducts = products.filter((product) => (product.category ?? 'etc') === selectedCategory)
  const countInCategory = (category: string) => products.filter((product) => {
    if ((product.category ?? 'etc') !== category) return false
    return Number(quantities[product.id] ?? 0) > 0
  }).length
  const currentStep = statusStep(todayBatch?.status)
  const submittedLocked = !!todayBatch && todayBatch.status !== 'open'

  return (
    <View style={s.container}>
      <View style={s.tabBar}>
        {(['form', 'status', 'history'] as const).map((key) => (
          <TouchableOpacity key={key} style={[s.tabBtn, tab === key && s.tabBtnActive]} onPress={() => setTab(key)}>
            <Text style={[s.tabLabel, tab === key && s.tabLabelActive]}>
              {key === 'form' ? '발주 입력' : key === 'status' ? '발주 확인' : '발주 내역'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'form' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <ScrollView
            style={s.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" />}
          >
            {submittedLocked && (
              <View style={s.infoBox}>
                <Text style={s.infoText}>{businessDate} 발주가 이미 제출되었습니다. ({STATUS_LABELS[todayBatch.status]})</Text>
              </View>
            )}

            <View style={s.card}>
              <Text style={s.cardTitle}>{businessDate === todayKst() ? '오늘 발주 입력' : '다음날 발주 입력'}</Text>
              <Text style={s.cardSub}>{businessDate}</Text>
              {products.length !== 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={s.categoryScroll}
                  contentContainerStyle={s.categoryBar}
                >
                  {availableCategories.map((category) => {
                    const active = category === selectedCategory
                    const count = countInCategory(category)
                    return (
                      <TouchableOpacity
                        key={category}
                        style={[s.categoryBtn, active && s.categoryBtnActive]}
                        onPress={() => setSelectedCategory(category)}
                        activeOpacity={0.75}
                      >
                        <Text style={s.categoryEmoji}>{CATEGORY_EMOJI[category] ?? '📦'}</Text>
                        <Text style={[s.categoryLabel, active && s.categoryLabelActive]}>
                          {CATEGORY_LABELS[category] ?? category}
                        </Text>
                        {count > 0 && (
                          <View style={s.categoryBadge}>
                            <Text style={s.categoryBadgeText}>{count}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              )}
              {products.length !== 0 && categoryProducts.length === 0 && (
                <Text style={[s.empty, { marginTop: 24, marginBottom: 24 }]}>이 카테고리에 품목이 없습니다.</Text>
              )}
              {products.length !== 0 ? categoryProducts.map((product) => (
                <View key={product.id} style={s.productRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.productName}>{product.standard_name}</Text>
                    <Text style={s.productUnit}>{product.default_unit}</Text>
                  </View>
                  <TextInput
                    style={s.qtyInput}
                    value={quantities[product.id] ?? ''}
                    onChangeText={(value) => setQuantities((prev) => ({ ...prev, [product.id]: value }))}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#d1d5db"
                    editable={!submittedLocked}
                  />
                  <Text style={s.unitLabel}>{product.default_unit}</Text>
                  <View style={s.priceBox}>
                    <Text style={s.priceLabel}>단가</Text>
                    <Text style={s.priceValue}>
                      {unitPrices[product.id] > 0
                        ? `${Math.round(unitPrices[product.id]).toLocaleString('ko-KR')}원`
                        : '-'}
                    </Text>
                  </View>
                </View>
              )) : (
                <Text style={s.empty}>발주 가능한 품목이 없습니다.{'\n'}관리자에게 문의해주세요.</Text>
              )}
            </View>

            <TouchableOpacity
              style={[s.submitBtn, (submitting || submittedLocked) && s.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting || submittedLocked}
            >
              <Text style={s.submitBtnText}>{submitting ? '제출 중...' : '발주 제출'}</Text>
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {tab === 'status' && (
        <ScrollView
          style={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" />}
        >
          {todayBatch && todayBatch.status !== 'open' ? (
            <>
              <View style={s.card}>
                <Text style={s.cardTitle}>진행 상태</Text>
                <Text style={s.cardSub}>{todayBatch.business_date}</Text>
                <View style={s.progressWrap}>
                  <View style={s.progressTrack} />
                  <View style={[s.progressFill, { width: currentStep <= 0 ? '0%' : `${(currentStep / (STEPS.length - 1)) * 100}%` }]} />
                  {STEPS.map((step, index) => {
                    const done = index <= currentStep
                    const current = index === currentStep
                    return (
                      <View key={step.key} style={s.stepCol}>
                        <View style={[s.stepDot, done ? s.stepDotDone : s.stepDotPending]}>
                          <Text style={{ color: done ? '#fff' : '#9ca3af', fontSize: 10, fontWeight: '700' }}>
                            {index < currentStep ? '✓' : String(index + 1)}
                          </Text>
                        </View>
                        <Text style={[s.stepLabel, done && !current ? s.stepLabelDone : current ? s.stepLabelCurrent : s.stepLabelPending]}>{step.label}</Text>
                      </View>
                    )
                  })}
                </View>
              </View>

              <View style={[s.card, { marginBottom: 24 }]}>
                <Text style={s.cardTitle}>발주 품목</Text>
                {selectedProducts.length !== 0 ? selectedProducts.map((product) => (
                  <View key={product.id} style={s.itemRow}>
                    <Text style={s.itemName}>{product.standard_name}</Text>
                    <Text style={s.itemQty}>{quantities[product.id]}{product.default_unit}</Text>
                  </View>
                )) : (
                  <Text style={[s.empty, { marginTop: 16 }]}>품목 정보를 불러오는 중...</Text>
                )}
              </View>
            </>
          ) : (
            <Text style={s.empty}>{businessDate} 제출된 발주가 없습니다.{'\n'}발주 입력 탭에서 발주를 제출해주세요.</Text>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {tab === 'history' && (
        <ScrollView
          style={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" />}
        >
          {history.length !== 0 ? history.map((batch) => (
            <TouchableOpacity key={batch.id} style={s.batchCard} onPress={() => void toggleBatch(batch.id)}>
              <View style={s.batchRow}>
                <View style={[s.statusDot, { backgroundColor: STATUS_COLORS[batch.status] ?? '#6b7280' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.batchDate}>{batch.business_date}</Text>
                  <Text style={[s.batchStatus, { color: STATUS_COLORS[batch.status] ?? '#6b7280' }]}>{STATUS_LABELS[batch.status] ?? batch.status}</Text>
                </View>
                <Text style={s.expandArrow}>{expandedBatch === batch.id ? '▲' : '▼'}</Text>
              </View>
              {expandedBatch === batch.id && (
                <View style={s.itemList}>
                  {!batchItems[batch.id] ? (
                    <ActivityIndicator size="small" color="#16a34a" style={{ marginVertical: 8 }} />
                  ) : batchItems[batch.id].length !== 0 ? batchItems[batch.id].map((item) => (
                    <View key={item.product_name} style={s.itemRow}>
                      <Text style={s.itemName}>{item.product_name}</Text>
                      <Text style={s.itemQty}>{item.qty}{item.unit}</Text>
                    </View>
                  )) : (
                    <Text style={[s.empty, { marginTop: 0, fontSize: 13 }]}>품목 내역이 없습니다.</Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          )) : (
            <Text style={s.empty}>발주 내역이 없습니다.</Text>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#16a34a' },
  tabLabel: { fontSize: 14, color: '#9ca3af', fontWeight: '500' },
  tabLabelActive: { color: '#16a34a', fontWeight: '700' },
  scroll: { flex: 1 },
  card: { backgroundColor: '#fff', margin: 12, borderRadius: 12, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 4 },
  cardSub: { fontSize: 13, color: '#9ca3af', marginBottom: 16 },
  categoryScroll: { marginHorizontal: -16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e5e7eb', marginBottom: 4 },
  categoryBar: { paddingHorizontal: 8 },
  categoryBtn: { position: 'relative', minWidth: 68, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  categoryBtnActive: { backgroundColor: '#f0fdf4', borderBottomColor: '#16a34a' },
  categoryEmoji: { fontSize: 21, marginBottom: 2 },
  categoryLabel: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  categoryLabelActive: { color: '#15803d', fontWeight: '700' },
  categoryBadge: { position: 'absolute', top: 5, right: 5, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center' },
  categoryBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  infoBox: { margin: 12, marginBottom: 0, backgroundColor: '#fef3c7', borderRadius: 8, padding: 12 },
  infoText: { fontSize: 13, color: '#92400e' },
  productRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  productName: { fontSize: 15, fontWeight: '600', color: '#111' },
  productUnit: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  qtyInput: { width: 64, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 16, textAlign: 'center', color: '#111', backgroundColor: '#f9fafb' },
  priceBox: { width: 82, alignItems: 'flex-end', marginLeft: 8 },
  priceLabel: { fontSize: 10, color: '#9ca3af', marginBottom: 1 },
  priceValue: { fontSize: 13, fontWeight: '700', color: '#374151' },
  unitLabel: { fontSize: 13, color: '#6b7280', marginLeft: 6, width: 28 },
  submitBtn: { backgroundColor: '#16a34a', marginHorizontal: 12, marginTop: 12, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 60, fontSize: 14, lineHeight: 22 },
  progressWrap: { position: 'relative', flexDirection: 'row', alignItems: 'flex-start', marginTop: 8, marginBottom: 4 },
  progressTrack: { position: 'absolute', top: 11, left: '6%', right: '6%', height: 2, backgroundColor: '#e5e7eb' },
  progressFill: { position: 'absolute', top: 11, left: '6%', height: 2, backgroundColor: '#16a34a' },
  stepCol: { flex: 1, alignItems: 'center' },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  stepDotDone: { backgroundColor: '#16a34a' },
  stepDotPending: { backgroundColor: '#e5e7eb' },
  stepLabel: { fontSize: 10, marginTop: 5, textAlign: 'center' },
  stepLabelDone: { color: '#6b7280', fontWeight: '500' },
  stepLabelCurrent: { color: '#16a34a', fontWeight: '700' },
  stepLabelPending: { color: '#9ca3af', fontWeight: '400' },
  batchCard: { backgroundColor: '#fff', marginHorizontal: 12, marginTop: 8, borderRadius: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 1, overflow: 'hidden' },
  batchRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  batchDate: { fontSize: 15, fontWeight: '600', color: '#111' },
  batchStatus: { fontSize: 13, marginTop: 2, fontWeight: '500' },
  expandArrow: { fontSize: 11, color: '#9ca3af', marginLeft: 8 },
  itemList: { borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: '#f9fafb', padding: 12 },
  itemRow: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  itemName: { flex: 1, fontSize: 13, color: '#374151' },
  itemQty: { fontSize: 13, color: '#6b7280', width: 64, textAlign: 'right' },
})
