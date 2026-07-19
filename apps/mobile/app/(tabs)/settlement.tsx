import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

import { supabase } from '@/lib/supabase'

type Spec = { specId: string; date: string; total: number }
type Period = { key: string; label: string; startDate: string; endDate: string; total: number; specs: Spec[] }
type Line = { product_name: string; qty: number; unit: string; amount: number }

function todayKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
}

function mondayOf(value: string) {
  const d = new Date(value)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().split('T')[0]
}

function sundayOf(value: string) {
  const d = new Date(value)
  d.setUTCDate(d.getUTCDate() + 6)
  return d.toISOString().split('T')[0]
}

function formatDate(value: string) {
  const [, month, day] = value.split('-')
  return `${Number(month)}/${Number(day)}`
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default function SettlementScreen() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [totalOutstanding, setTotalOutstanding] = useState(0)
  const [cycle, setCycle] = useState<'monthly' | 'weekly'>('monthly')
  const [periods, setPeriods] = useState<Period[]>([])
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null)
  const [expandedSpec, setExpandedSpec] = useState<string | null>(null)
  const [lines, setLines] = useState<Record<string, Line[]>>({})
  const [todaySpec, setTodaySpec] = useState<Spec | null>(null)
  const [todayLines, setTodayLines] = useState<Line[]>([])

  const loadSpecLines = useCallback(async (specId: string) => {
    if (lines[specId]) return

    const { data } = await supabase
      .from('daily_spec_lines')
      .select('qty, unit, amount, products(standard_name)')
      .eq('daily_spec_id', specId)

    const mapped = (data ?? []).map((line) => {
      const product = unwrapRelation<{ standard_name: string }>(line.products)
      return {
        product_name: product?.standard_name ?? '알 수 없음',
        qty: Number(line.qty),
        unit: line.unit,
        amount: Number(line.amount),
      }
    })

    setLines((prev) => ({ ...prev, [specId]: mapped }))
  }, [lines])

  const toggleSpec = useCallback(async (specId: string) => {
    if (expandedSpec !== specId) {
      setExpandedSpec(specId)
      await loadSpecLines(specId)
    } else {
      setExpandedSpec(null)
    }
  }, [expandedSpec, loadSpecLines])

  const handlePayment = useCallback((period: Period) => {
    Alert.alert(
      '계좌이체 안내',
      `이체 금액: ${period.total.toLocaleString()}원\n\n은행: NH농협은행\n계좌번호: 302-1748-8091-81\n예금주: 차숙희\n\n입금 후 관리자에게 알려주세요.`,
      [{ text: '확인', style: 'default' }],
    )
  }, [])

  const load = useCallback(async () => {
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
      .select('id, settlement_cycle')
      .eq('organization_id', membership.organization_id)
      .maybeSingle()
    if (!restaurant) return

    const settlementCycle = restaurant.settlement_cycle ?? 'monthly'
    setCycle(settlementCycle === 'weekly' ? 'weekly' : 'monthly')

    const from = new Date()
    from.setMonth(from.getMonth() - 6)
    const fromDate = from.toISOString().split('T')[0]
    const today = todayKst()

    const { data: specs } = await supabase
      .from('daily_specs')
      .select('id, business_date, total_amount')
      .eq('restaurant_id', restaurant.id)
      .gte('business_date', fromDate)
      .order('business_date', { ascending: false })

    const grouped = new Map<string, Period>()
    const currentSpec = (specs ?? []).find((spec) => spec.business_date === today)
    setTodaySpec(currentSpec ? { specId: currentSpec.id, date: currentSpec.business_date, total: Number(currentSpec.total_amount) } : null)

    if (currentSpec) {
      const { data: currentLines } = await supabase
        .from('daily_spec_lines')
        .select('qty, unit, amount, products(standard_name)')
        .eq('daily_spec_id', currentSpec.id)

      setTodayLines((currentLines ?? []).map((line) => {
        const product = unwrapRelation<{ standard_name: string }>(line.products)
        return {
          product_name: product?.standard_name ?? '알 수 없음',
          qty: Number(line.qty),
          unit: line.unit,
          amount: Number(line.amount),
        }
      }))
    } else {
      setTodayLines([])
    }

    for (const spec of specs ?? []) {
      let key: string
      let label: string
      let startDate: string
      let endDate: string

      if (settlementCycle === 'weekly') {
        startDate = mondayOf(spec.business_date)
        endDate = sundayOf(startDate)
        key = startDate
        label = `${formatDate(startDate)} ~ ${formatDate(endDate)}`
      } else {
        const [year, month] = spec.business_date.split('-')
        key = `${year}-${month}`
        label = `${year}년 ${Number(month)}월`
        startDate = `${year}-${month}-01`
        const lastDay = new Date(Number(year), Number(month), 0).getDate()
        endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`
      }

      const row = grouped.get(key)
      const specRow = {
        specId: spec.id,
        date: spec.business_date,
        total: Number(spec.total_amount),
      }

      if (!row) {
        grouped.set(key, {
          key,
          label,
          startDate,
          endDate,
          total: specRow.total,
          specs: [specRow],
        })
      } else {
        row.total += specRow.total
        row.specs.push(specRow)
      }
    }

    setPeriods([...grouped.values()])

    const { data: receivables } = await supabase
      .from('receivables')
      .select('balance')
      .eq('restaurant_id', restaurant.id)
      .in('status', ['unpaid', 'partial', 'overdue'])

    setTotalOutstanding((receivables ?? []).reduce((sum, row) => sum + Number(row.balance), 0))
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

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
      <View style={s.summaryCard}>
        <View style={s.summaryRow}>
          <View>
            <Text style={s.summaryLabel}>현재 미수금</Text>
            <Text style={[s.summaryAmount, totalOutstanding > 0 && s.danger]}>{totalOutstanding.toLocaleString()}원</Text>
          </View>
          <View style={[s.cycleBadge, cycle === 'weekly' ? s.cycleWeekly : s.cycleMonthly]}>
            <Text style={s.cycleText}>{cycle === 'weekly' ? '주정산' : '월정산'}</Text>
          </View>
        </View>
        {totalOutstanding === 0 && <Text style={s.safeText}>✅ 미수금이 없습니다.</Text>}
      </View>

      <View style={s.sectionHeader}>
        <Text style={[s.sectionTitle, s.sectionTitleInline]}>당일 명세서</Text>
        <Text style={s.sectionNote}>최종금액은 13시전에 업로드됩니다.</Text>
      </View>
      <View style={s.todayCard}>
        {todaySpec ? (
          <>
            <View style={s.todayHeader}>
              <View>
                <Text style={s.todayDate}>{todaySpec.date}</Text>
                <Text style={s.todaySub}>오늘 납품 금액</Text>
              </View>
              <Text style={s.todayAmount}>{todaySpec.total.toLocaleString()}원</Text>
            </View>
            <View style={s.todayLineList}>
              {todayLines.length !== 0 ? todayLines.map((line) => (
                <View key={`${line.product_name}-${line.unit}-${line.amount}`} style={s.lineRow}>
                  <Text style={s.lineName}>{line.product_name}</Text>
                  <Text style={s.lineQty}>{line.qty}{line.unit}</Text>
                  <Text style={s.lineAmount}>{line.amount.toLocaleString()}원</Text>
                </View>
              )) : (
                <Text style={s.lineEmpty}>품목 내역이 없습니다.</Text>
              )}
            </View>
          </>
        ) : (
          <Text style={s.todayEmpty}>오늘 등록된 명세서가 없습니다.</Text>
        )}
      </View>

      <Text style={s.sectionTitle}>정산 내역</Text>

      {periods.length !== 0 ? periods.map((period) => (
        <TouchableOpacity key={period.key} style={s.periodCard} onPress={() => setExpandedPeriod(expandedPeriod === period.key ? null : period.key)}>
          <View style={s.periodRow}>
            <Text style={s.periodLabel}>{period.label}</Text>
            <View style={s.periodRight}>
              <Text style={s.periodAmount}>{period.total.toLocaleString()}원</Text>
              <Text style={s.arrow}>{expandedPeriod === period.key ? '▲' : '▼'}</Text>
            </View>
          </View>

          {expandedPeriod === period.key && (
            <View style={s.periodDetail}>
              <Text style={s.detailText}>기간: {period.startDate} ~ {period.endDate}</Text>
              <Text style={s.detailText}>합계: {period.total.toLocaleString()}원</Text>

              {period.specs.length > 0 && (
                <View style={s.specSection}>
                  <Text style={s.specSectionTitle}>납품 명세서</Text>
                  {period.specs.map((spec) => (
                    <View key={spec.specId}>
                      <TouchableOpacity style={s.specRow} onPress={(event) => { event.stopPropagation?.(); void toggleSpec(spec.specId) }}>
                        <Text style={s.specDate}>{formatDate(spec.date)}</Text>
                        <View style={s.specRight}>
                          <Text style={s.specAmount}>{spec.total.toLocaleString()}원</Text>
                          <Text style={s.arrow}>{expandedSpec === spec.specId ? '▲' : '▼'}</Text>
                        </View>
                      </TouchableOpacity>

                      {expandedSpec === spec.specId && (
                        <View style={s.lineList}>
                          {!lines[spec.specId] ? (
                            <ActivityIndicator size="small" color="#16a34a" style={{ marginVertical: 8 }} />
                          ) : lines[spec.specId].length !== 0 ? lines[spec.specId].map((line) => (
                            <View key={line.product_name} style={s.lineRow}>
                              <Text style={s.lineName}>{line.product_name}</Text>
                              <Text style={s.lineQty}>{line.qty}{line.unit}</Text>
                              <Text style={s.lineAmount}>{line.amount.toLocaleString()}원</Text>
                            </View>
                          )) : (
                            <Text style={s.lineEmpty}>품목 내역이 없습니다.</Text>
                          )}
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity style={s.payBtn} onPress={(event) => { event.stopPropagation?.(); handlePayment(period) }}>
                <Text style={s.payBtnText}>결제하기</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      )) : (
        <View style={s.emptyCard}>
          <Text style={s.empty}>정산 내역이 없습니다.</Text>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  summaryCard: { backgroundColor: '#fff', margin: 16, borderRadius: 16, padding: 20, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 13, color: '#6b7280', marginBottom: 6 },
  summaryAmount: { fontSize: 28, fontWeight: '800', color: '#111' },
  danger: { color: '#dc2626' },
  safeText: { fontSize: 13, color: '#16a34a', marginTop: 10 },
  cycleBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  cycleWeekly: { backgroundColor: '#f3e8ff' },
  cycleMonthly: { backgroundColor: '#dbeafe' },
  cycleText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 8, gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', marginHorizontal: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionTitleInline: { marginHorizontal: 0, marginBottom: 0 },
  sectionNote: { flexShrink: 1, fontSize: 10, color: '#9ca3af', textAlign: 'right' },
  todayCard: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' },
  todayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  todayDate: { fontSize: 15, fontWeight: '700', color: '#111' },
  todaySub: { fontSize: 12, color: '#9ca3af', marginTop: 3 },
  todayAmount: { fontSize: 18, fontWeight: '800', color: '#16a34a' },
  todayLineList: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f9fafb' },
  todayEmpty: { color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: 28 },
  emptyCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 12, padding: 40, alignItems: 'center' },
  empty: { color: '#9ca3af', fontSize: 14 },
  periodCard: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 8, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' },
  periodRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  periodLabel: { fontSize: 15, fontWeight: '600', color: '#111' },
  periodRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  periodAmount: { fontSize: 15, fontWeight: '700', color: '#16a34a' },
  arrow: { fontSize: 12, color: '#9ca3af' },
  periodDetail: { backgroundColor: '#f9fafb', padding: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  detailText: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  specSection: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 12 },
  specSectionTitle: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  specDate: { fontSize: 14, fontWeight: '600', color: '#374151' },
  specRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  specAmount: { fontSize: 14, color: '#374151' },
  lineList: { backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4 },
  lineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  lineName: { flex: 1, fontSize: 13, color: '#374151' },
  lineQty: { width: 60, textAlign: 'right', fontSize: 12, color: '#6b7280' },
  lineAmount: { width: 80, textAlign: 'right', fontSize: 12, fontWeight: '600', color: '#111' },
  lineEmpty: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 8 },
  payBtn: { backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  payBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
