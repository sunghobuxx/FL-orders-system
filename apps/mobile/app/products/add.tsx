import { useCallback, useEffect, useMemo, useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { MEMBER_API_URL } from '@/lib/member-api'
import { supabase } from '@/lib/supabase'

type AddableProduct = {
  id: string
  standard_name: string
  category: string | null
  default_unit: string
  price: number | null
  needsApproval: boolean
}

type PendingProduct = { product_id: string; standard_name: string }

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

const CATEGORY_ORDER = ['vegetable', 'fruit', 'grain', 'meat', 'seafood', 'dairy', 'seasoning', 'etc']

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default function AddProductsScreen() {
  const params = useLocalSearchParams<{ restaurantId?: string; businessDate?: string }>()
  const restaurantId = singleParam(params.restaurantId)
  const businessDate = singleParam(params.businessDate)
  const [products, setProducts] = useState<AddableProduct[]>([])
  const [pending, setPending] = useState<PendingProduct[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!restaurantId || !businessDate) {
      Alert.alert('오류', '업체 또는 발주 날짜 정보가 없습니다.', [{ text: '확인', onPress: () => router.back() }])
      return
    }

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
      const query = new URLSearchParams({ restaurantId, businessDate })
      const response = await fetch(`${MEMBER_API_URL}/api/member/products?${query}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const payload = await response.json() as {
        addable?: AddableProduct[]
        pending?: PendingProduct[]
        error?: string
      }
      if (!response.ok) throw new Error(payload.error ?? '추가 가능한 품목을 불러오지 못했습니다.')
      setProducts(payload.addable ?? [])
      setPending(payload.pending ?? [])
    } catch (error) {
      Alert.alert('오류', error instanceof Error ? error.message : '추가 가능한 품목을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [businessDate, restaurantId])

  useEffect(() => {
    void load()
  }, [load])

  const categories = useMemo(() => {
    const counts = products.reduce<Record<string, number>>((result, product) => {
      const category = product.category ?? 'etc'
      result[category] = (result[category] ?? 0) + 1
      return result
    }, {})
    const known = CATEGORY_ORDER.filter((category) => counts[category])
    const extra = Object.keys(counts).filter((category) => !CATEGORY_ORDER.includes(category)).sort()
    return [...known, ...extra].map((category) => ({ category, count: counts[category] }))
  }, [products])

  const visibleProducts = useMemo(() => selectedCategory
    ? products.filter((product) => (product.category ?? 'etc') === selectedCategory)
    : products, [products, selectedCategory])

  const toggle = useCallback((id: string) => {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const addSelected = useCallback(async () => {
    if (!restaurantId || picked.size === 0) return
    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
      const response = await fetch(`${MEMBER_API_URL}/api/member/products`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ restaurantId, productIds: [...picked] }),
      })
      const payload = await response.json() as {
        added?: string[]
        requested?: string[]
        skipped?: number
        error?: string
      }
      if (!response.ok) throw new Error(payload.error ?? '품목을 추가하지 못했습니다.')

      const messages: string[] = []
      if (payload.added?.length) messages.push(`${payload.added.length}개 추가됐습니다`)
      if (payload.requested?.length) messages.push(`${payload.requested.length}개는 담당자 확인 중입니다`)
      if (payload.skipped) messages.push(`${payload.skipped}개는 이미 들어가 있습니다`)
      Alert.alert('처리 완료', messages.join(' · ') || '처리되었습니다.', [
        { text: '확인', onPress: () => router.back() },
      ])
      setPicked(new Set())
    } catch (error) {
      Alert.alert('오류', error instanceof Error ? error.message : '품목을 추가하지 못했습니다.')
    } finally {
      setSubmitting(false)
    }
  }, [picked, restaurantId])

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <Text style={s.title}>품목 추가</Text>
        <TouchableOpacity onPress={() => router.back()} style={s.closeBtn}>
          <Text style={s.closeText}>닫기</Text>
        </TouchableOpacity>
      </View>

      {pending.length > 0 && (
        <View style={s.pendingBox}>
          <Text style={s.pendingText}>담당자 확인 중 · {pending.map((item) => item.standard_name).join(', ')}</Text>
        </View>
      )}

      <View style={s.categoryContent}>
        <TouchableOpacity style={[s.chip, selectedCategory === null && s.chipActive]} onPress={() => setSelectedCategory(null)}>
          <Text style={[s.chipText, selectedCategory === null && s.chipTextActive]}>전체 {products.length}</Text>
        </TouchableOpacity>
        {categories.map(({ category, count }) => (
          <TouchableOpacity
            key={category}
            style={[s.chip, selectedCategory === category && s.chipActive]}
            onPress={() => setSelectedCategory(category)}
          >
            <Text style={[s.chipText, selectedCategory === category && s.chipTextActive]}>
              {CATEGORY_LABELS[category] ?? category} {count}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#16a34a" /></View>
      ) : (
        <FlatList
          data={visibleProducts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={visibleProducts.length === 0 ? s.emptyList : s.list}
          ListEmptyComponent={<Text style={s.empty}>추가할 수 있는 품목이 없습니다.</Text>}
          renderItem={({ item }) => {
            const checked = picked.has(item.id)
            return (
              <TouchableOpacity style={[s.row, checked && s.rowSelected]} onPress={() => toggle(item.id)} activeOpacity={0.7}>
                <View style={[s.checkbox, checked && s.checkboxChecked]}>
                  {checked && <Text style={s.checkmark}>✓</Text>}
                </View>
                <Text style={s.productName} numberOfLines={1}>{item.standard_name}</Text>
                {item.price !== null ? (
                  <Text style={s.price}>{Math.round(item.price).toLocaleString('ko-KR')}원/{item.default_unit}</Text>
                ) : (
                  <Text style={s.noPrice}>단가 문의</Text>
                )}
              </TouchableOpacity>
            )
          }}
          ListFooterComponent={(
            <Text style={s.guide}>
              「단가 문의」 품목은 바로 열리지 않고 담당자 확인을 거칩니다.{`\n`}
              단가는 오늘 기준이며 실제 청구는 발주일 기준으로 계산됩니다.
            </Text>
          )}
        />
      )}

      <View style={s.footer}>
        <Text style={s.selectedCount}>{picked.size}개 선택</Text>
        <TouchableOpacity
          style={[s.addBtn, (picked.size === 0 || submitting) && s.addBtnDisabled]}
          onPress={() => void addSelected()}
          disabled={picked.size === 0 || submitting}
        >
          <Text style={s.addBtnText}>{submitting ? '처리 중...' : '내 발주 목록에 추가'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: { height: 56, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  closeText: { fontSize: 14, color: '#6b7280', fontWeight: '600' },
  pendingBox: { marginHorizontal: 12, marginTop: 12, borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb', borderRadius: 9, padding: 11 },
  pendingText: { color: '#a16207', fontSize: 12, lineHeight: 18 },
  categoryContent: { marginTop: 12, paddingHorizontal: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, borderRadius: 9, backgroundColor: '#f3f4f6', paddingHorizontal: 13, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: '#1f2937' },
  chipText: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { margin: 12, paddingBottom: 8, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' },
  emptyList: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: '#9ca3af', fontSize: 14 },
  row: { minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#fff' },
  rowSelected: { backgroundColor: '#f0fdf4' },
  checkbox: { width: 22, height: 22, marginRight: 12, borderRadius: 5, borderWidth: 1.5, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkboxChecked: { borderColor: '#16a34a', backgroundColor: '#16a34a' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  productName: { flex: 1, minWidth: 0, marginRight: 10, fontSize: 14, color: '#1f2937' },
  price: { flexShrink: 0, fontSize: 12, color: '#6b7280' },
  noPrice: { flexShrink: 0, fontSize: 12, color: '#d97706', fontWeight: '600' },
  guide: { paddingHorizontal: 4, paddingTop: 14, paddingBottom: 10, color: '#9ca3af', fontSize: 11, lineHeight: 18 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  selectedCount: { color: '#6b7280', fontSize: 13 },
  addBtn: { flex: 1, borderRadius: 11, paddingVertical: 14, alignItems: 'center', backgroundColor: '#16a34a' },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
})
