import { useCallback, useEffect, useRef, useState } from 'react'
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

type Product = { id: string; standard_name: string; default_unit: string }
type Batch = { id: string; business_date: string; status: string }
type BatchState = { batch: Batch | null; quantities: Record<string, string> }
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

function todayKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
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
  const [productError, setProductError] = useState<string | null>(null)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [todayBatch, setTodayBatch] = useState<Batch | null>(null)
  const [history, setHistory] = useState<Batch[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null)
  const [batchItems, setBatchItems] = useState<Record<string, BatchItem[]>>({})
  const fetchedItemBatches = useRef(new Set<string>())

  const loadProducts = useCallback(async (restId: string) => {
    const { data: whitelist, error: whitelistError } = await supabase
      .from('restaurant_products')
      .select('product_id')
      .eq('restaurant_id', restId)
      .order('display_order')

    if (whitelistError) {
      console.warn('Could not load restaurant product whitelist; using all active products:', whitelistError)
    }

    const whitelistIds = whitelistError
      ? []
      : (whitelist ?? []).map((row) => row.product_id)
    let productQuery = supabase
      .from('products')
      .select('id, standard_name, default_unit')
      .eq('status', 'active')

    if (whitelistIds.length !== 0) {
      const { data: rows, error } = await productQuery.in('id', whitelistIds)
      if (error) throw error

      const productsById = new Map((rows ?? []).map((product) => [product.id, product as Product]))
      return whitelistIds
        .map((productId) => productsById.get(productId))
        .filter(Boolean) as Product[]
    }

    const { data: rows, error } = await productQuery
      .order('category')
      .order('standard_name')

    if (error) throw error
    return (rows ?? []) as Product[]
  }, [])

  const loadToday = useCallback(async (restId: string): Promise<BatchState> => {
    const date = todayKst()
    const { data: batch } = await supabase
      .from('order_batches')
      .select('id, business_date, status')
      .eq('restaurant_id', restId)
      .eq('business_date', date)
      .maybeSingle()

    const qtyMap: Record<string, string> = {}
    if (batch) {
      const { data: order } = await supabase
        .from('orders')
        .select('id')
        .eq('batch_id', batch.id)
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

    return { batch: batch as Batch | null, quantities: qtyMap }
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
    try {
      const [productRows, current, batches] = await Promise.all([
        loadProducts(restId),
        loadToday(restId),
        loadHistory(restId),
      ])
      setProducts(productRows)
      setProductError(null)
      setTodayBatch(current.batch)
      setQuantities(current.quantities)
      setHistory(batches)
    } catch (error) {
      console.error('Failed to load order data:', error)
      setProducts([])
      setProductError('품목을 불러오지 못했습니다. 아래로 당겨 다시 시도해주세요.')
    }
  }, [loadHistory, loadProducts, loadToday])

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
    try {
      await reload(restaurantId)
    } finally {
      setRefreshing(false)
    }
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
      const businessDate = todayKst()
      const submittedAt = new Date().toISOString()
      let batchId = todayBatch?.id

      if (!batchId) {
        const { data: newBatch, error } = await supabase
          .from('order_batches')
          .insert({ restaurant_id: restaurantId, business_date: businessDate, status: 'open' })
          .select('id')
          .single()
        if (error || !newBatch) throw error
        batchId = newBatch.id
      }

      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id')
        .eq('batch_id', batchId)
        .maybeSingle()

      let orderId = existingOrder?.id
      if (!orderId) {
        const { data: order, error } = await supabase
          .from('orders')
          .insert({ batch_id: batchId, order_no: `FL-${Date.now()}`, source_type: 'web', version: 1 })
          .select('id')
          .single()
        if (error || !order) throw error
        orderId = order.id
      } else {
        const { error } = await supabase.from('order_items').delete().eq('order_id', orderId)
        if (error) throw error
      }

      const rows = selected.map((product) => ({
        order_id: orderId,
        product_id: product.id,
        qty: Number(quantities[product.id]),
        unit: product.default_unit,
        unit_price_snapshot: 0,
      }))

      const { error: itemError } = await supabase.from('order_items').insert(rows)
      if (itemError) throw itemError

      const { error: batchError } = await supabase
        .from('order_batches')
        .update({ status: 'submitted', submitted_at: submittedAt })
        .eq('id', batchId)
      if (batchError) throw batchError

      Alert.alert('발주 완료', '발주가 제출되었습니다.', [
        {
          text: '확인',
          onPress: () => {
            setTab('status')
            void reload(restaurantId)
          },
        },
      ])
    } catch {
      Alert.alert('오류', '발주 제출에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }, [products, quantities, reload, restaurantId, todayBatch])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setProductError('로그인 정보를 확인할 수 없습니다.')
        return
      }

      const { data: membership } = await supabase
        .from('memberships')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!membership?.organization_id) {
        setProductError('업체 연결 정보를 확인할 수 없습니다.')
        return
      }

      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('id')
        .eq('organization_id', membership.organization_id)
        .maybeSingle()

      if (!restaurant?.id) {
        setProductError('식당 정보를 확인할 수 없습니다.')
        return
      }

      setRestaurantId(restaurant.id)
      await reload(restaurant.id)
    }

    init()
      .catch((error) => {
        console.error('Failed to initialize order screen:', error)
        setProductError('발주 정보를 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))
  }, [reload])

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
                <Text style={s.infoText}>오늘 발주가 이미 제출되었습니다. ({STATUS_LABELS[todayBatch.status]})</Text>
              </View>
            )}

            <View style={s.card}>
              <Text style={s.cardTitle}>오늘 발주 입력</Text>
              <Text style={s.cardSub}>{todayKst()}</Text>
              {productError ? (
                <Text style={s.empty}>{productError}</Text>
              ) : products.length !== 0 ? products.map((product) => (
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
            <Text style={s.empty}>오늘 제출된 발주가 없습니다.{'\n'}발주 입력 탭에서 발주를 제출해주세요.</Text>
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
  infoBox: { margin: 12, marginBottom: 0, backgroundColor: '#fef3c7', borderRadius: 8, padding: 12 },
  infoText: { fontSize: 13, color: '#92400e' },
  productRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  productName: { fontSize: 15, fontWeight: '600', color: '#111' },
  productUnit: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  qtyInput: { width: 64, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 16, textAlign: 'center', color: '#111', backgroundColor: '#f9fafb' },
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
