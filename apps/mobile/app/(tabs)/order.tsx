import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { router, useFocusEffect } from 'expo-router'
import {
  ActivityIndicator,
  AppState,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import { supabase } from '@/lib/supabase'
import { MEMBER_API_URL, memberRequest } from '@/lib/member-api'
import { toPackQty, unitLabel } from '@/lib/pack-size'
import { orderFingerprint, shouldKeepDraft, progressStep } from '@/lib/order-state'

type Product = {
  id: string
  standard_name: string
  default_unit: string
  allowed_units: string[] | null
  category: string | null
  pack_unit: string | null
  kg_per_pack: number | null
  added_by: 'admin' | 'member'
}
type PendingProduct = { product_id: string; standard_name: string }
type Batch = { id: string; business_date: string; status: string; amount?: number }
type BatchState = { batch: Batch | null; orderId: string | null; businessDate: string; quantities: Record<string, string>; units: Record<string, string>; products: Product[]; today: string; minutes: number }
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
  return progressStep(status)
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
  const [pricesByUnit, setPricesByUnit] = useState<Record<string, number>>({})
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [dateLoading, setDateLoading] = useState(false)
  const [unitPicker, setUnitPicker] = useState<Product | null>(null)
  const selectedDateRef = useRef<string | null>(null)
  const dirtyRef = useRef(false)
  const loadVersion = useRef(0)
  const [deliveryContacts, setDeliveryContacts] = useState<Array<{ id: string; name: string; phone: string | null }>>([])
  const [contactError, setContactError] = useState(false)
  const [pendingProducts, setPendingProducts] = useState<PendingProduct[]>([])
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [units, setUnits] = useState<Record<string, string>>({})
  const [packNotices, setPackNotices] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [todayBatch, setTodayBatch] = useState<Batch | null>(null)
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null)
  const orderReady = useRef(false)
  const submittingRef = useRef(false)
  const savedFingerprint = useRef('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [savedQuantities, setSavedQuantities] = useState<Record<string, string>>({})
  const [savedUnits, setSavedUnits] = useState<Record<string, string>>({})
  const [serverClock, setServerClock] = useState<{ today: string; minutes: number } | null>(null)
  const [businessDate, setBusinessDate] = useState(todayKst())
  const activeBatchRef = useRef<Batch | null>(null)
  const activeDateRef = useRef(businessDate)
  const [history, setHistory] = useState<Batch[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null)
  const [batchItems, setBatchItems] = useState<Record<string, BatchItem[]>>({})
  const fetchedItemBatches = useRef(new Set<string>())

  const loadPendingProducts = useCallback(async (restId: string, date: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return []

    try {
      const params = new URLSearchParams({ restaurantId: restId, businessDate: date })
      const payload = await memberRequest<{ pending?: PendingProduct[] }>(`/products?${params}`)
      return payload.pending ?? []
    } catch (error) {
      if (__DEV__) console.log('Failed to load pending products:', error)
      return []
    }
  }, [])

  const loadUnitPrices = useCallback(async (restId: string, date: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return { prices: {}, unitPrices: {} }

    try {
      const params = new URLSearchParams({ restaurantId: restId, businessDate: date })
      const payload = await memberRequest<{ prices?: Record<string, number>; unitPrices?: Record<string, number> }>(`/product-prices?${params}`)
      return { prices: payload.prices ?? {}, unitPrices: payload.unitPrices ?? {} }
    } catch (error) {
      // 단가 API가 잠시 끊겨도 Expo 개발 오류 화면이 발주 화면을 덮지 않게 한다.
      // 목록은 계속 사용할 수 있고, 새로고침 시 단가를 다시 조회한다.
      if (__DEV__) console.log('Failed to load unit prices:', error)
      return { prices: {}, unitPrices: {} }
    }
  }, [])

  const loadToday = useCallback(async (_restId: string, explicitDate?: string): Promise<BatchState> => {
    const date = explicitDate ?? selectedDateRef.current
    return memberRequest<BatchState>('/order-form' + (date ? '?date=' + encodeURIComponent(date) : ''))
  }, [])

  const loadHistory = useCallback(async (restId: string) => {
    const { data, error } = await supabase
      .from('order_batches')
      .select('id, business_date, status')
      .eq('restaurant_id', restId)
      .gte('business_date', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
      .in('status', ['submitted', 'validated', 'ordered', 'dispatched', 'completed'])
      .order('business_date', { ascending: false })
    if (error) throw new Error('발주 내역을 불러오지 못했습니다.')
    const { data: specs, error: specError } = await supabase.from('daily_specs').select('business_date, total_amount')
      .eq('restaurant_id', restId).in('business_date', (data ?? []).map(b => b.business_date))
    if (specError) throw new Error('발주 금액을 불러오지 못했습니다.')
    const totals = new Map((specs ?? []).map(spec => [spec.business_date, Number(spec.total_amount)]))
    const missing = (data ?? []).filter(b => !totals.has(b.business_date))
    if (missing.length) {
      const { data: items, error: itemError } = await supabase.from('order_items').select('amount, orders!inner(batch_id)').in('orders.batch_id', missing.map(b => b.id))
      if (itemError) throw new Error('발주 금액을 불러오지 못했습니다.')
      for (const item of items ?? []) {
        const order = unwrapRelation<{ batch_id: string }>(item.orders)
        const batch = missing.find(b => b.id === order?.batch_id)
        if (batch) totals.set(batch.business_date, (totals.get(batch.business_date) ?? 0) + Number(item.amount ?? 0))
      }
    }
    return (data ?? []).map(batch => ({ ...batch, amount: totals.get(batch.business_date) ?? 0 })) as Batch[]
  }, [])

  const reload = useCallback(async (restId: string, discard = false) => {
    const version = ++loadVersion.current
    const [current, batches] = await Promise.all([
      loadToday(restId),
      loadHistory(restId).catch(() => null),
    ])
    const [prices, pending] = await Promise.all([
      loadUnitPrices(restId, current.businessDate),
      loadPendingProducts(restId, current.businessDate),
    ])
    if (version !== loadVersion.current) return
    setProducts(current.products)
    setServerClock({ today: current.today, minutes: current.minutes })
    setUnitPrices(prices.prices)
    setPricesByUnit(prices.unitPrices)
    setPendingProducts(pending)
    if (batches) setHistory(batches)
    if (shouldKeepDraft(dirtyRef.current, discard)) return
    activeBatchRef.current = current.batch
    activeDateRef.current = current.businessDate
    setTodayBatch(current.batch)
    setCurrentOrderId(current.orderId)
    setBusinessDate(current.businessDate)
    setQuantities(current.quantities)
    setUnits(current.units)
    setSavedQuantities(current.quantities)
    setSavedUnits(current.units)
    savedFingerprint.current = orderFingerprint(current)
    setPackNotices({})
    dirtyRef.current = false
    orderReady.current = true
    setLoadError(null)
    setBatchItems({})
    fetchedItemBatches.current.clear()
  }, [loadHistory, loadPendingProducts, loadToday, loadUnitPrices])

  const syncActiveOrder = useCallback(async (restId: string) => {
    if (dirtyRef.current || submittingRef.current) return
    await reload(restId)
    /* All successful reads, including unchanged batches, restore readiness. */
  }, [reload])


  const loadBatchItems = useCallback(async (batchId: string) => {
    if (batchItems[batchId]) return

    const { data: order } = await supabase
      .from('orders')
      .select('id')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: false }).limit(1)
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
    if (dirtyRef.current) {
      const discard = await new Promise<boolean>(resolve => Alert.alert('작성 중인 발주', '수정한 수량을 취소하고 저장된 발주를 다시 불러올까요?', [
        { text: '계속 작성', style: 'cancel', onPress: () => resolve(false) },
        { text: '다시 불러오기', style: 'destructive', onPress: () => resolve(true) },
      ], { cancelable: false }))
      if (!discard) return
    }
    setRefreshing(true)
    try {
      await reload(restaurantId, true)
    } catch {
      Alert.alert('조회 실패', '발주를 불러오지 못했습니다. 다시 새로고침해주세요.')
    } finally {
      setRefreshing(false)
    }
  }, [reload, restaurantId])

  const submitOrder = useCallback(async (selected: Product[]) => {
    if (!restaurantId) return
    if (submittingRef.current) return
    if (!orderReady.current) {
      Alert.alert('조회 필요', '기존 발주를 확인하지 못했습니다. 새로고침 후 다시 제출해주세요.')
      return
    }
    const selectedIds = new Set(selected.map((product) => product.id))
    if (Object.entries(quantities).some(([id, qty]) => Number(qty) > 0 && !selectedIds.has(id))) {
      Alert.alert('품목 확인 필요', '기존 발주 중 목록에서 찾을 수 없는 품목이 있습니다. 기존 품목 보호를 위해 제출을 중단했습니다. 관리자에게 문의해주세요.')
      return
    }
    submittingRef.current = true
    setSubmitting(true)
    let sent = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const current = await loadToday(restaurantId, businessDate)
      if (orderFingerprint(current) !== savedFingerprint.current || (current.batch && !['open', 'submitted'].includes(current.batch.status))) {
        Alert.alert('발주 정보 변경', '다른 화면에서 발주가 변경됐습니다. 입력은 보존했습니다. 새로고침하여 기존 발주를 확인한 후 다시 수정해주세요.')
        return
      }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')

      const items = selected.map((product) => {
        const enteredQty = Number(quantities[product.id])
        const enteredUnit = units[product.id] ?? product.default_unit
        const packed = toPackQty(enteredQty, enteredUnit, product)
        return {
          product_id: product.id,
          qty: packed?.qty ?? enteredQty,
          unit: packed?.unit ?? enteredUnit,
          // 변환된 줄은 서버가 포장 단위 단가를 다시 찾게 한다.
          unit_price_snapshot: 0, // 저장 시 선택 단위의 최신 단가를 서버에서 확정한다.
          memo: '',
        }
      })

      const controller = new AbortController()
      timeout = setTimeout(() => controller.abort(), 25000)
      sent = true
      const response = await fetch(`${MEMBER_API_URL}/api/member/orders`, {
        signal: controller.signal,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          restaurantId,
          businessDate,
          batchId: todayBatch?.id ?? null,
          orderId: currentOrderId,
          items,
          isSubmit: true,
        }),
      })
      const payload = await response.json() as { error?: string }
      if (response.status === 409) {
        orderReady.current = false
        const message = payload.error ?? '발주 정보가 변경되었습니다. 목록을 다시 확인해주세요.'
        try {
          await reload(restaurantId, true)
          Alert.alert('발주 확인 필요', message)
        } catch {
          Alert.alert('발주 확인 필요', `${message}\n목록을 불러오지 못했습니다. 새로고침 후 다시 제출해주세요.`)
        }
        return
      }
      if (!response.ok) throw new Error(payload.error ?? '발주 제출에 실패했습니다.')

      selectedDateRef.current = businessDate
      dirtyRef.current = false
      orderReady.current = false
      try { await reload(restaurantId, true) } catch {
        setLoadError('발주는 저장됐지만 재조회에 실패했습니다. 다시 제출하지 말고 새로고침해주세요.')
        Alert.alert('발주 저장 완료', '저장은 완료됐습니다. 조회에 실패했으므로 다시 제출하지 말고 새로고침해주세요.')
        return
      }

      Alert.alert('발주 완료', '발주가 제출되었습니다.', [
        {
          text: '확인',
          onPress: () => {
            setTab('status')
          },
        },
      ])
    } catch (error) {
      if (sent) {
        orderReady.current = false
        setLoadError('저장 결과를 확인하지 못했습니다. 중복 제출하지 말고 새로고침하여 발주를 확인해주세요.')
      }
      Alert.alert('오류', error instanceof Error ? error.message : '발주 제출에 실패했습니다.')
    } finally {
      if (timeout) clearTimeout(timeout)
      submittingRef.current = false
      setSubmitting(false)
    }
  }, [businessDate, currentOrderId, quantities, reload, restaurantId, todayBatch, unitPrices, units, loadToday])

  const updateQuantity = useCallback((product: Product, value: string) => {
    if (submittingRef.current) return
    loadVersion.current += 1
    dirtyRef.current = true
    setQuantities((prev) => ({ ...prev, [product.id]: value }))
    setPackNotices((prev) => ({ ...prev, [product.id]: '' }))
  }, [])

  const applyPackSize = useCallback((product: Product) => {
    const qty = Number(quantities[product.id])
    const enteredUnit = units[product.id] ?? product.default_unit
    const packed = toPackQty(qty, enteredUnit, product)
    if (!packed) return
    setQuantities((prev) => ({ ...prev, [product.id]: String(packed.qty) }))
    setUnits((prev) => ({ ...prev, [product.id]: packed.unit }))
    setPackNotices((prev) => ({
      ...prev,
      [product.id]: `${qty}kg = ${packed.qty}${unitLabel(packed.unit)}로 바꿨어요`,
    }))
  }, [quantities, units])

  const handleSubmit = useCallback(() => {
    const selected = products.filter((product) => {
      const qty = quantities[product.id]
      return qty && Number(qty) > 0
    })

    if (selected.length === 0) {
      Alert.alert('알림', '수량을 입력해주세요.')
      return
    }

    const missingPriceNames = selected
      .filter((product) => {
        const enteredUnit = units[product.id] ?? product.default_unit
        const packed = toPackQty(Number(quantities[product.id]), enteredUnit, product)
        const unit = packed?.unit ?? enteredUnit
        const multi = new Set([product.default_unit, ...(product.allowed_units ?? [])]).size > 1
        return (multi ? pricesByUnit[`${product.id}:${unit}`] : unitPrices[product.id]) <= 0 ||
          (multi ? pricesByUnit[`${product.id}:${unit}`] : unitPrices[product.id]) === undefined
      })
      .map((product) => product.standard_name)

    if (missingPriceNames.length > 0) {
      Alert.alert(
        '단가가 정해지지 않은 품목이 있습니다',
        `${missingPriceNames.join(', ')}\n\n그대로 발주하면 금액이 0원으로 잡힙니다. 담당자에게 확인해 주세요.\n계속할까요?`,
        [
          { text: '취소', style: 'cancel' },
          { text: '계속 발주', style: 'destructive', onPress: () => void submitOrder(selected) },
        ],
      )
      return
    }

    void submitOrder(selected)
  }, [products, quantities, submitOrder, unitPrices, pricesByUnit, units])

  const selectDate = (date: string) => {
    if (submittingRef.current) return
    const change = () => {
      selectedDateRef.current = date
      setDatePickerOpen(false)
      if (restaurantId) {
        setDateLoading(true)
        orderReady.current = false
        void reload(restaurantId, true).catch(() => Alert.alert('조회 실패', '발주를 불러오지 못했습니다. 새로고침해주세요.'))
          .finally(() => setDateLoading(false))
      }
    }
    if (dirtyRef.current) {
      Alert.alert('날짜 변경', '저장하지 않은 수량 변경을 취소하고 날짜를 바꿀까요?', [
        { text: '취소', style: 'cancel' }, { text: '날짜 변경', onPress: change },
      ])
    } else change()
  }

  useEffect(() => {
    if (!restaurantId) return
    let cancelled = false
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const response = await fetch(`${MEMBER_API_URL}/api/member/delivery-contact?restaurantId=${restaurantId}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        })
        if (!response.ok) throw new Error('연락처 조회 실패')
        const data = await response.json()
        if (!cancelled) { setDeliveryContacts(data.contacts ?? []); setContactError(false) }
      } catch { if (!cancelled) setContactError(true) }
    })()
    return () => { cancelled = true }
  }, [restaurantId, refreshing])

  const removeProduct = useCallback((product: Product) => {
    if (!restaurantId || product.added_by !== 'member') return

    Alert.alert(
      '품목 빼기',
      `“${product.standard_name}”을(를) 내 발주 목록에서 뺄까요?\n지난 발주 기록은 그대로 남습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '빼기',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { session } } = await supabase.auth.getSession()
              if (!session?.access_token) throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
              const params = new URLSearchParams({ restaurantId, productId: product.id })
              const response = await fetch(`${MEMBER_API_URL}/api/member/products?${params}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${session.access_token}` },
              })
              const payload = await response.json() as { error?: string }
              if (!response.ok) throw new Error(payload.error ?? '품목을 빼지 못했습니다.')
              setQuantities((prev) => {
                const next = { ...prev }
                delete next[product.id]
                return next
              })
              await reload(restaurantId)
            } catch (error) {
              Alert.alert('오류', error instanceof Error ? error.message : '품목을 빼지 못했습니다.')
            }
          },
        },
      ],
    )
  }, [reload, restaurantId])

  useEffect(() => {
    async function init() {
      const profile = await memberRequest<{ restaurantId: string | null }>('/profile')
      if (!profile.restaurantId) throw new Error('식당 정보가 없습니다. 관리자에게 문의해주세요.')
      setRestaurantId(profile.restaurantId)
      await reload(profile.restaurantId)
    }

    init().catch(() => Alert.alert('조회 실패', '발주를 불러오지 못했습니다. 새로고침해주세요.')).finally(() => setLoading(false))
  }, [reload])

  useFocusEffect(useCallback(() => {
    if (!restaurantId) return

    // 입력 중에는 조회 결과로 수량/배송일을 교체하지 않는다.
    if (!dirtyRef.current) setDateLoading(true)
    void reload(restaurantId)
      .catch(() => setLoadError('발주 조회에 실패했습니다. 입력은 보존했습니다. 새로고침해주세요.'))
      .finally(() => setDateLoading(false))
    const interval = setInterval(() => {
      void syncActiveOrder(restaurantId).catch(() => setLoadError('자동 조회에 실패했습니다. 다시 시도해주세요.'))
    }, 30_000)

    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') void syncActiveOrder(restaurantId).catch(() => setLoadError('발주 조회에 실패했습니다.'))
    })
    return () => { clearInterval(interval); appState.remove() }
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

  if (loading || dateLoading) {
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
  const submittedLocked = businessDate < (serverClock?.today ?? todayKst()) ||
    (businessDate === (serverClock?.today ?? todayKst()) && (serverClock ? serverClock.minutes >= 240 : isAfterOrderCutoff())) ||
    (!!todayBatch && !['open', 'submitted'].includes(todayBatch.status))

  return (
    <View style={s.container}>
      {loadError && <TouchableOpacity onPress={() => void onRefresh()} style={s.infoBox}><Text style={s.infoText}>{loadError}</Text></TouchableOpacity>}
      <View style={s.tabBar}>
        {(['form', 'status', 'history'] as const).map((key) => (
          <TouchableOpacity key={key} disabled={submitting} style={[s.tabBtn, tab === key && s.tabBtnActive]} onPress={() => {
            setTab(key)
            if (key === 'form' && submittedLocked && !dirtyRef.current && restaurantId) {
              selectedDateRef.current = null
              orderReady.current = false
              setDateLoading(true)
              void reload(restaurantId, true).catch(() => setLoadError('다음 발주일 조회에 실패했습니다. 다시 조회해주세요.')).finally(() => setDateLoading(false))
            }
          }}>
            <Text style={[s.tabLabel, tab === key && s.tabLabelActive]}>
              {key === 'form' ? '발주 입력' : key === 'status' ? '발주 확인' : '발주 내역'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab !== 'history' && (
        <View style={s.card}><TouchableOpacity onPress={() => setDatePickerOpen(true)} accessibilityRole="button">
          <Text style={s.cardTitle}>배송일: {businessDate} ▾</Text>
          <Text style={{ color: '#6b7280' }}>날짜를 눌러 발주할 날짜 또는 확인할 날짜를 선택하세요.</Text>
        </TouchableOpacity><View style={{ flexDirection: 'row', gap: 24, marginTop: 12 }}>
          <TouchableOpacity onPress={() => { const date = new Date(`${businessDate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - 1); selectDate(date.toISOString().slice(0, 10)) }}><Text>‹ 이전</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => selectDate(todayKst())}><Text>오늘</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => selectDate(tomorrowKst())}><Text style={{ color: '#16a34a', fontWeight: '700' }}>내일 배송 발주</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => { const date = new Date(`${businessDate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); selectDate(date.toISOString().slice(0, 10)) }}><Text>다음 ›</Text></TouchableOpacity>
        </View></View>
      )}
      <Modal visible={datePickerOpen} transparent animationType="fade" onRequestClose={() => setDatePickerOpen(false)}>
        <View style={s.modalBackdrop}><View style={s.modalCard}>
          <Text style={s.cardTitle}>배송일 선택</Text>
          <ScrollView>
            {Array.from({ length: 15 }, (_, index) => {
              const date = new Date(`${todayKst()}T00:00:00Z`)
              date.setUTCDate(date.getUTCDate() + index - 7)
              const value = date.toISOString().slice(0, 10)
              return <TouchableOpacity key={value} style={s.itemRow} onPress={() => selectDate(value)}>
                <Text style={s.itemName}>{value}{index === 7 ? ' (오늘)' : index === 8 ? ' (내일)' : ''}{value === businessDate ? ' ✓' : ''}</Text>
              </TouchableOpacity>
            })}
          </ScrollView>
          <TouchableOpacity onPress={() => setDatePickerOpen(false)}><Text style={s.cardTitle}>닫기</Text></TouchableOpacity>
        </View></View>
      </Modal>
      <Modal visible={!!unitPicker} transparent animationType="fade" onRequestClose={() => setUnitPicker(null)}>
        <View style={s.modalBackdrop}><View style={s.modalCard}>
          <Text style={s.cardTitle}>{unitPicker?.standard_name} 단위 선택</Text>
          {unitPicker && [...new Set([unitPicker.default_unit, ...(unitPicker.allowed_units ?? [])])].map(unit => (
            <TouchableOpacity key={unit} style={s.itemRow} onPress={() => {
              dirtyRef.current = true
              loadVersion.current += 1
              setUnits(prev => ({ ...prev, [unitPicker.id]: unit }))
              setPackNotices(prev => ({ ...prev, [unitPicker.id]: '' }))
              setUnitPicker(null)
            }}><Text style={s.itemName}>{unitLabel(unit)}</Text></TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setUnitPicker(null)}><Text style={s.cardTitle}>취소</Text></TouchableOpacity>
        </View></View>
      </Modal>

      {tab === 'form' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <ScrollView
            style={s.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" />}
          >
            <Text style={{ padding: 16, color: '#6b7280' }}>발주 마감 02:00 · 02:00~04:00 당일 발주는 관리자 확인 후 처리 · 04:00 이후 내일 배송 발주</Text>
            {submittedLocked && (
              <View style={s.infoBox}>
                <Text style={s.infoText}>{businessDate} 발주는 마감 또는 배송 진행되어 수정할 수 없습니다. 다음 배송일을 선택해주세요.</Text>
              </View>
            )}

            <View style={s.card}>
              <Text style={s.cardTitle}>{businessDate} 발주 입력</Text>
              <Text style={s.cardSub}>{businessDate}</Text>
              {pendingProducts.length > 0 && (
                <View style={s.pendingBox}>
                  <Text style={s.pendingText}>
                    담당자 확인 중 · {pendingProducts.map((product) => product.standard_name).join(', ')}
                  </Text>
                </View>
              )}
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
                    <View style={s.productNameRow}>
                      <Text style={s.productName}>{product.standard_name}</Text>
                      {product.added_by === 'member' && (
                        <TouchableOpacity
                          style={s.removeBtn}
                          onPress={() => removeProduct(product)}
                          accessibilityRole="button"
                          accessibilityLabel={`${product.standard_name} 품목 빼기`}
                        >
                          <Text style={s.removeBtnText}>×</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={s.productUnit}>{unitLabel(units[product.id] ?? product.default_unit)}</Text>
                    {!!packNotices[product.id] && (
                      <Text style={s.packNotice}>{packNotices[product.id]}</Text>
                    )}
                  </View>
                  <TextInput
                    style={s.qtyInput}
                    value={quantities[product.id] ?? ''}
                    onChangeText={(value) => updateQuantity(product, value)}
                    onBlur={() => applyPackSize(product)}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#d1d5db"
                    editable={!submittedLocked}
                  />
                  <TouchableOpacity disabled={submittedLocked} onPress={() => setUnitPicker(product)} accessibilityLabel={`${product.standard_name} 단위 변경`}>
                    <Text style={s.unitLabel}>{unitLabel(units[product.id] ?? product.default_unit)} ▾</Text>
                  </TouchableOpacity>
                  <View style={s.priceBox}>
                    <Text style={s.priceLabel}>단가</Text>
                    <Text style={s.priceValue}>
                      {(new Set([product.default_unit, ...(product.allowed_units ?? [])]).size > 1
                        ? pricesByUnit[`${product.id}:${units[product.id] ?? product.default_unit}`]
                        : unitPrices[product.id]) > 0
                        ? `${Math.round(new Set([product.default_unit, ...(product.allowed_units ?? [])]).size > 1
                          ? pricesByUnit[`${product.id}:${units[product.id] ?? product.default_unit}`]
                          : unitPrices[product.id]).toLocaleString('ko-KR')}원`
                        : '-'}
                    </Text>
                  </View>
                </View>
              )) : (
                <Text style={s.empty}>발주 가능한 품목이 없습니다.{'\n'}관리자에게 문의해주세요.</Text>
              )}
              <TouchableOpacity
                style={s.addProductBtn}
                onPress={() => router.push({
                  pathname: '../products/add',
                  params: { restaurantId, businessDate },
                })}
              >
                <Text style={s.addProductBtnText}>+ 품목 추가</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[s.submitBtn, (submitting || submittedLocked) && s.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting || submittedLocked}
            >
              <Text style={s.submitBtnText}>{submitting ? '저장 중...' : todayBatch?.status === 'submitted' ? '발주 수정 저장' : '발주 제출'}</Text>
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
          <View style={s.card}>
            <Text style={s.cardTitle}>배송 담당자 연락처</Text>
            {deliveryContacts.map(contact => <View key={contact.id} style={s.itemRow}>
              <Text style={s.itemName}>{contact.name}</Text>
              {contact.phone ? <TouchableOpacity onPress={() => {
                void Linking.openURL(`tel:${contact.phone!.replace(/[^+0-9]/g, '')}`).catch(() => Alert.alert('전화 연결', '이 기기에서는 전화를 연결할 수 없습니다.'))
              }}><Text style={{ color: '#16a34a' }}>{contact.phone}</Text></TouchableOpacity>
                : <Text>연락처 미등록</Text>}
            </View>)}
            {deliveryContacts.length === 0 && <Text>{contactError ? '연락처를 불러오지 못했습니다. 새로고침해주세요.' : '등록된 배송 담당자가 없습니다.'}</Text>}
          </View>
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
                {products.filter(p => Number(savedQuantities[p.id]) > 0).length !== 0 ? products.filter(p => Number(savedQuantities[p.id]) > 0).map((product) => (
                  <View key={product.id} style={s.itemRow}>
                    <Text style={s.itemName}>{product.standard_name}</Text>
                    <Text style={s.itemQty}>{savedQuantities[product.id]}{unitLabel(savedUnits[product.id] ?? product.default_unit)}</Text>
                  </View>
                )) : (
                  <Text style={[s.empty, { marginTop: 16 }]}>품목 정보를 불러오는 중...</Text>
                )}
              </View>
              <TouchableOpacity style={s.submitBtn} onPress={() => router.push({ pathname: '/spec' as never, params: { date: businessDate } })}><Text style={s.submitBtnText}>명세서</Text></TouchableOpacity>
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
                  <Text>{Number(batch.amount ?? 0).toLocaleString()}원</Text>
                  <Text style={[s.batchStatus, { color: STATUS_COLORS[batch.status] ?? '#6b7280' }]}>{STATUS_LABELS[batch.status] ?? batch.status}</Text>
                </View>
                <Text style={s.expandArrow}>{expandedBatch === batch.id ? '▲' : '▼'}</Text>
              </View>
              {expandedBatch === batch.id && (
                <View style={s.itemList}>
                  <TouchableOpacity onPress={() => router.push({ pathname: '/spec' as never, params: { date: batch.business_date } })}><Text style={{ color: '#16a34a', paddingVertical: 12 }}>명세서 확인 →</Text></TouchableOpacity>
                  {!batchItems[batch.id] ? (
                    <ActivityIndicator size="small" color="#16a34a" style={{ marginVertical: 8 }} />
                  ) : batchItems[batch.id].length !== 0 ? batchItems[batch.id].map((item) => (
                    <View key={item.product_name} style={s.itemRow}>
                      <Text style={s.itemName}>{item.product_name}</Text>
                      <Text style={s.itemQty}>{item.qty}{unitLabel(item.unit)}</Text>
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
  modalBackdrop: { flex: 1, backgroundColor: '#0006', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, maxHeight: '70%' },
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
  pendingBox: { borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  pendingText: { fontSize: 12, lineHeight: 18, color: '#a16207' },
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
  productNameRow: { flexDirection: 'row', alignItems: 'center' },
  productName: { fontSize: 15, fontWeight: '600', color: '#111' },
  removeBtn: { width: 26, height: 26, borderRadius: 13, marginLeft: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fef2f2' },
  removeBtnText: { color: '#ef4444', fontSize: 20, lineHeight: 22, fontWeight: '500' },
  productUnit: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  packNotice: { fontSize: 11, color: '#16a34a', marginTop: 3 },
  qtyInput: { width: 64, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 16, textAlign: 'center', color: '#111', backgroundColor: '#f9fafb' },
  priceBox: { width: 82, alignItems: 'flex-end', marginLeft: 8 },
  priceLabel: { fontSize: 10, color: '#9ca3af', marginBottom: 1 },
  priceValue: { fontSize: 13, fontWeight: '700', color: '#374151' },
  unitLabel: { fontSize: 13, color: '#6b7280', marginLeft: 6, width: 28 },
  addProductBtn: { marginTop: 16, borderWidth: 1, borderColor: '#16a34a', borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f0fdf4' },
  addProductBtnText: { color: '#15803d', fontSize: 14, fontWeight: '700' },
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
