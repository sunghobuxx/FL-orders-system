import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { router } from 'expo-router'

import { supabase } from '@/lib/supabase'

type ProductPrice = { product_name: string; unit: string; price: number }
type WeeklyItem = { product_name: string; total_qty: number; unit: string; total_cost: number }
type Notice = { id: string; title: string; created_at: string }

const logo = require('../../assets/icon.png')

function todayKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
}

function startOfKstWeek(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  const day = kst.getDay()
  const start = new Date(kst)
  start.setDate(kst.getDate() - (day === 0 ? 6 : day - 1))
  return start
}

function weekRangeText() {
  const start = startOfKstWeek()
  const end = new Date(start)
  end.setDate(start.getDate() + 5)
  return `${start.getMonth() + 1}/${start.getDate()}(월) ~ ${end.getMonth() + 1}/${end.getDate()}(토)`
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [itemCount, setItemCount] = useState(0)
  const [outstanding, setOutstanding] = useState(0)
  const [prices, setPrices] = useState<ProductPrice[]>([])
  const [weeklyItems, setWeeklyItems] = useState<WeeklyItem[]>([])
  const [weeklyTotal, setWeeklyTotal] = useState(0)
  const [insight, setInsight] = useState<string | null>(null)
  const [notices, setNotices] = useState<Notice[]>([])

  const loadAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: membership } = await supabase
      .from('memberships')
      .select('organizations(id)')
      .eq('user_id', user.id)
      .single()

    const organization = unwrapRelation<{ id: string }>(membership?.organizations)
    if (!organization?.id) return

    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('id')
      .eq('organization_id', organization.id)
      .maybeSingle()

    const restId = restaurant?.id ?? null
    setRestaurantId(restId)

    const today = todayKst()

    if (restId) {
      const { data: batch } = await supabase
        .from('order_batches')
        .select('id, status')
        .eq('restaurant_id', restId)
        .eq('business_date', today)
        .maybeSingle()

      if (batch) {
        setSubmitted(batch.status !== 'open')

        const { data: order } = await supabase
          .from('orders')
          .select('id')
          .eq('batch_id', batch.id)
          .maybeSingle()

        if (order) {
          const { count } = await supabase
            .from('order_items')
            .select('id', { count: 'exact', head: true })
            .eq('order_id', order.id)
          setItemCount(count ?? 0)
        }
      } else {
        setSubmitted(false)
        setItemCount(0)
      }

      const { data: receivables } = await supabase
        .from('receivables')
        .select('balance')
        .eq('restaurant_id', restId)
        .in('status', ['unpaid', 'partial', 'overdue'])

      setOutstanding((receivables ?? []).reduce((sum, row) => sum + Number(row.balance), 0))

      const { data: restaurantProducts } = await supabase
        .from('restaurant_products')
        .select('products(id, standard_name, default_unit)')
        .eq('restaurant_id', restId)
        .order('display_order')

      const productRows = (restaurantProducts ?? [])
        .map((row) => unwrapRelation<{ id: string; standard_name: string; default_unit: string }>(row.products))
        .filter(Boolean) as { id: string; standard_name: string; default_unit: string }[]
      const productIds = productRows.map((product) => product.id)

      if (productIds.length > 0) {
        const { data: supplierProducts } = await supabase
          .from('supplier_products')
          .select('id, product_id')
          .in('product_id', productIds)

        const supplierByProduct = new Map((supplierProducts ?? []).map((row) => [row.product_id, row.id]))
        const supplierIds = (supplierProducts ?? []).map((row) => row.id)
        const priceBySupplier = new Map<string, number>()

        if (supplierIds.length > 0) {
          const { data: snapshots } = await supabase
            .from('price_snapshots')
            .select('supplier_product_id, sale_price')
            .in('supplier_product_id', supplierIds)
            .lte('effective_from', today)
            .order('effective_from', { ascending: false })

          for (const snapshot of snapshots ?? []) {
            if (!priceBySupplier.has(snapshot.supplier_product_id)) {
              priceBySupplier.set(snapshot.supplier_product_id, Number(snapshot.sale_price))
            }
          }
        }

        setPrices(productRows.map((product) => {
          const supplierId = supplierByProduct.get(product.id)
          return {
            product_name: product.standard_name,
            unit: product.default_unit,
            price: supplierId ? priceBySupplier.get(supplierId) ?? 0 : 0,
          }
        }))
      } else {
        setPrices([])
      }

      const weekStart = startOfKstWeek().toISOString().split('T')[0]
      const { data: weeklySpecs } = await supabase
        .from('daily_specs')
        .select('orders(order_items(qty, unit, unit_price_snapshot, products(standard_name)))')
        .eq('restaurant_id', restId)
        .gte('business_date', weekStart)

      const byProduct: Record<string, WeeklyItem> = {}
      for (const spec of weeklySpecs ?? []) {
        for (const order of spec.orders ?? []) {
          for (const item of order.order_items ?? []) {
            const product = unwrapRelation<{ standard_name: string }>(item.products)
            const name = product?.standard_name ?? '알 수 없음'
            if (!byProduct[name]) {
              byProduct[name] = {
                product_name: name,
                total_qty: 0,
                unit: item.unit,
                total_cost: 0,
              }
            }
            byProduct[name].total_qty += Number(item.qty)
            byProduct[name].total_cost += Number(item.qty) * Number(item.unit_price_snapshot)
          }
        }
      }

      const weekly = Object.values(byProduct)
      setWeeklyItems(weekly)
      setWeeklyTotal(weekly.reduce((sum, item) => sum + item.total_cost, 0))

      const { data: weeklyInsight } = await supabase
        .from('weekly_insights')
        .select('insight_text')
        .eq('restaurant_id', restId)
        .gte('week_start', weekStart)
        .maybeSingle()

      setInsight(weeklyInsight?.insight_text ?? null)
    }

    const { data: latestNotices } = await supabase
      .from('notices')
      .select('id, title, created_at')
      .order('created_at', { ascending: false })
      .limit(3)

    setNotices((latestNotices ?? []) as Notice[])
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadAll()
    setRefreshing(false)
  }, [loadAll])

  useEffect(() => {
    loadAll().finally(() => setLoading(false))
  }, [loadAll])

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#16a34a" size="large" />
      </View>
    )
  }

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" />}
    >
      <View style={s.header}>
        <Image source={logo} style={s.logo} resizeMode="contain" />
      </View>

      <TouchableOpacity style={s.card} onPress={() => router.push('/(tabs)/order')}>
        <Text style={s.cardTitle}>📋 오늘 발주 현황</Text>
        <View style={s.row}>
          <View style={[s.statusBadge, submitted ? s.badgeGreen : s.badgeYellow]}>
            <Text style={[s.statusText, submitted ? s.textGreen : s.textYellow]}>
              {submitted ? '제출 완료' : '미제출'}
            </Text>
          </View>
          {itemCount > 0 && <Text style={s.itemCount}>품목 {itemCount}개</Text>}
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={s.card} onPress={() => router.push('/(tabs)/settlement')}>
        <Text style={s.cardTitle}>💰 현재 미수금</Text>
        <Text style={[s.bigAmount, outstanding > 0 ? s.danger : s.safe]}>
          {outstanding.toLocaleString()}원
        </Text>
        {outstanding === 0 && <Text style={s.safeNote}>✅ 미수금 없음</Text>}
      </TouchableOpacity>

      {prices.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>🏷 현재 납품 단가</Text>
          {prices.map((item, index) => (
            <View key={`${item.product_name}-${index}`} style={s.priceRow}>
              <Text style={s.priceName}>{item.product_name}</Text>
              <Text style={s.priceVal}>{item.price > 0 ? `${item.price.toLocaleString()}원/${item.unit}` : '-'}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={s.card}>
        <Text style={s.cardTitle}>📊 이번 주 납품 분석</Text>
        <Text style={s.dateRange}>{weekRangeText()}</Text>
        {weeklyItems.length !== 0 ? (
          <>
            {weeklyItems.map((item, index) => (
              <View key={`${item.product_name}-${index}`} style={s.weekRow}>
                <Text style={s.weekName}>{item.product_name}</Text>
                <Text style={s.weekQty}>{item.total_qty}{item.unit}</Text>
                <Text style={s.weekCost}>{item.total_cost.toLocaleString()}원</Text>
              </View>
            ))}
            <View style={[s.weekRow, s.totalRow]}>
              <Text style={s.totalLabel}>주간 총 비용</Text>
              <Text style={s.totalAmount}>{weeklyTotal.toLocaleString()}원</Text>
            </View>
          </>
        ) : (
          <Text style={s.empty}>이번 주 발주 내역이 없습니다.</Text>
        )}
      </View>

      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>✨ 수급위험 예측 · 구매 어드바이스</Text>
          <Text style={s.badge}>AI 분석</Text>
        </View>
        <Text style={insight ? s.insightText : s.empty}>
          {insight ?? 'AI 분석 데이터를 불러오는 중입니다.'}
        </Text>
      </View>

      <View style={[s.card, { marginBottom: 24 }]}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>📢 공지사항</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/notices')}>
            <Text style={s.more}>전체보기 →</Text>
          </TouchableOpacity>
        </View>
        {notices.length !== 0 ? notices.map((item) => (
          <TouchableOpacity key={item.id} style={s.listItem} onPress={() => router.push(`/notice/${item.id}` as never)}>
            <Text style={s.listTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={s.listDate}>{new Date(item.created_at).toLocaleDateString('ko-KR')}</Text>
          </TouchableOpacity>
        )) : (
          <Text style={s.empty}>공지 없음</Text>
        )}
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', paddingTop: 20, paddingBottom: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  logo: { width: 140, height: 56 },
  card: { backgroundColor: '#fff', margin: 12, marginBottom: 0, borderRadius: 12, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 10 },
  badge: { fontSize: 11, color: '#6b7280', backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  badgeGreen: { backgroundColor: '#dcfce7' },
  badgeYellow: { backgroundColor: '#fef9c3' },
  statusText: { fontSize: 13, fontWeight: '700' },
  textGreen: { color: '#16a34a' },
  textYellow: { color: '#92400e' },
  itemCount: { fontSize: 13, color: '#6b7280' },
  bigAmount: { fontSize: 28, fontWeight: '800', marginTop: 4 },
  danger: { color: '#dc2626' },
  safe: { color: '#111' },
  safeNote: { fontSize: 13, color: '#16a34a', marginTop: 4 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  priceName: { fontSize: 14, color: '#374151' },
  priceVal: { fontSize: 14, color: '#111', fontWeight: '600' },
  dateRange: { fontSize: 12, color: '#9ca3af', marginBottom: 8, marginTop: -4 },
  weekRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  weekName: { flex: 1, fontSize: 14, color: '#374151' },
  weekQty: { fontSize: 13, color: '#6b7280', width: 60, textAlign: 'right' },
  weekCost: { fontSize: 13, color: '#111', width: 80, textAlign: 'right', fontWeight: '600' },
  totalRow: { borderBottomWidth: 0, marginTop: 4 },
  totalLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111' },
  totalAmount: { fontSize: 15, fontWeight: '700', color: '#16a34a' },
  insightText: { fontSize: 14, color: '#374151', lineHeight: 22 },
  empty: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 12 },
  more: { fontSize: 13, color: '#16a34a', fontWeight: '600' },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  listTitle: { flex: 1, fontSize: 14, color: '#374151' },
  listDate: { fontSize: 12, color: '#9ca3af', marginLeft: 8 },
})
