import { useRef, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { Card, Empty, Loading, Muted, Page, colors } from '../../components'
import { DateSelector } from '../../components/DateSelector'
import { useDriverResource } from '../../hooks/useDriverResource'
import { apiPost } from '../../lib/api'
import { fmtWon } from '../../lib/format'
import { defaultDispatchDate, groupGarakRows, dispatchCheckState, updateDispatchCheck, type DispatchResponse, type DispatchRow } from '../../lib/dispatch'

export default function HistoryScreen() {
  const [date, setDate] = useState(defaultDispatchDate)
  const [tab, setTab] = useState<'all' | 'garak' | 'suppliers'>('all')
  const [checking, setChecking] = useState<Set<string>>(new Set())
  const locks = useRef(new Set<string>())
  const queues = useRef(new Map<string, Promise<void>>())
  const activeDate = useRef(date)
  activeDate.current = date
  const { data, loading, refreshing, error, refresh, mutate } = useDriverResource<DispatchResponse>(`/api/driver/dispatch?date=${date}`, '발주 내역')

  async function toggle(row: DispatchRow, source: 'garak' | 'suppliers') {
    if (locks.current.has(row.orderItemId) || !row.canManage || !row.batchId || row.excluded) return
    const stage = dispatchCheckState(row, source).next
    if (stage === null) return
    const requestDate = date
    locks.current.add(row.orderItemId)
    setChecking(new Set(locks.current))
    mutate(data => updateDispatchCheck(data, row.orderItemId, stage))
    // Keep different batches responsive; serialize writes within a batch so the
    // server's all-items status calculation cannot race another tap in that batch.
    const previous = queues.current.get(row.batchId) ?? Promise.resolve()
    const task = previous.catch(() => undefined).then(async () => {
      const result = await apiPost<{ batchId: string; batchStatus: string }>('/api/driver/orders/check-items', { batchId: row.batchId, itemIds: [row.orderItemId], stage })
      if (activeDate.current === requestDate) mutate(data => updateDispatchCheck(data, row.orderItemId, stage, result))
    })
    queues.current.set(row.batchId, task)
    try { await task } catch (e: any) {
      if (activeDate.current === requestDate) mutate(data => updateDispatchCheck(data, row.orderItemId, row.checkStage))
      Alert.alert('확인 실패', e.message)
    } finally {
      if (queues.current.get(row.batchId) === task) queues.current.delete(row.batchId)
      locks.current.delete(row.orderItemId)
      setChecking(new Set(locks.current))
    }
  }

  function itemRow(row: DispatchRow, source: 'garak' | 'suppliers') {
    const state = dispatchCheckState(row, source)
    const checked = state.checked
    const pending = checking.has(row.orderItemId)
    const disabled = pending || state.disabled || !row.canManage || !row.batchId || row.excluded
    return <View key={row.orderItemId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 4, marginTop: 6 }}>
      <Text style={{ flex: 1, color: '#6B7280', fontSize: 13 }}>{row.restaurantName || '업체 미확인'}{row.excluded ? ' · 발주 제외' : ''}</Text>
      <Text style={{ color: '#6B7280', fontSize: 13 }}>{row.qty} {row.unit}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${row.restaurantName} ${row.name} ${state.label}`} accessibilityState={{ checked, busy: pending, disabled: !!disabled }} disabled={!!disabled} onPress={() => void toggle(row, source)} style={{ minWidth: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, backgroundColor: checked ? '#22C55E' : '#16A34A', opacity: disabled && !pending ? 0.55 : 1 }}>
        <Text style={{ fontWeight: '700', fontSize: 13, color: 'white' }}>{!row.canManage ? '조회 전용' : row.excluded ? '제외' : state.label}</Text>
      </Pressable>
    </View>
  }

  function supplierCard(supplier: { supplierId: string; supplierName: string; lines: Array<{ key?: string; name: string; qtyText?: string; qty?: number; unit: string; rows: DispatchRow[] }> }, source: 'garak' | 'suppliers', badge: string) {
    const garak = source === 'garak'
    return <View key={supplier.supplierId} style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: garak ? '#FDE68A' : '#E5E7EB', overflow: 'hidden', marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: garak ? '#FFFBEB' : '#EFF6FF', borderBottomWidth: 1, borderBottomColor: garak ? '#FEF3C7' : '#DBEAFE' }}>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: garak ? '#92400E' : '#1E40AF' }}>{supplier.supplierName}</Text>
        <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: garak ? '#FEF3C7' : '#DBEAFE' }}><Text style={{ fontSize: 12, fontWeight: '600', color: garak ? '#B45309' : '#1D4ED8' }}>{badge}</Text></View>
      </View>
      {supplier.lines.map((line, index) => <View key={line.key || `${line.name}-${line.unit}-${index}`} style={{ paddingHorizontal: 20, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: '#F3F4F6' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 }}>
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: '#1F2937' }}>{line.name}</Text>
          <Text style={{ fontSize: 15, color: '#4B5563' }}>{line.qtyText ?? `${Number((line.qty ?? 0).toFixed(2))} ${line.unit}`}</Text>
        </View>
        {line.rows.map(row => itemRow(row, source))}
      </View>)}
    </View>
  }

  return <Page><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { if (!locks.current.size) void refresh() }} />}>
    <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink }}>발주내역</Text>
    <View pointerEvents={checking.size ? 'none' : 'auto'}><DateSelector value={date} onChange={setDate} /></View>
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
      {(['all', 'garak', 'suppliers'] as const).map((value, index) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={{ flex: 1, alignItems: 'center', padding: 12, borderRadius: 8, backgroundColor: tab === value ? colors.green : colors.soft }}><Text style={{ fontWeight: '800', color: tab === value ? 'white' : colors.ink }}>{['전체', '가락', '남촌'][index]}</Text></Pressable>)}
    </View>
    {error ? <Muted>조회 실패: {error} · 아래로 당겨 다시 시도해 주세요.</Muted> : null}
    {loading ? <Loading /> : !data ? <Empty message="조회된 내역이 없습니다." /> : <>
      {tab === 'all' ? <>
        <Muted>당일 발주 집계 (전체) · {data.businessDate}</Muted>
        <Text style={{ fontWeight: '800', marginVertical: 10 }}>총 {fmtWon(data.totalAmount)}</Text>
        {!data.totals.length ? <Empty message="이 날짜의 발주가 없습니다." /> : <Card>{data.totals.map(i => <View key={`${i.productId}-${i.unit}`} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 4 }}><Text style={{ fontWeight: '800' }}>{i.name} · {i.qtyText}</Text><Muted>{fmtWon(i.amount)}</Muted></View>)}</Card>}
      </> : tab === 'garak' ? <>
        <Muted>가락 매입 (서울·일산) — 발주 문자 없음</Muted>
        {!data.garakItems?.length ? <Empty message="가락 매입 품목이 없습니다." /> : groupGarakRows(data.garakItems).map(supplier => supplierCard(supplier, 'garak', '발주 문자 없음'))}
      </> : <>
        <Muted>남촌 공급처별 발주 내역</Muted>
        {!data.suppliers.length ? <Empty message="남촌 공급처 발주가 없습니다." /> : data.suppliers.map(supplier => supplierCard(supplier, 'suppliers', supplier.autoDispatchExcluded ? '자동발송 제외' : supplier.sent ? '전송완료' : '전송대기'))}
      </>}
      {tab !== 'garak' && data.unmappedItems.length ? <Card><Text style={{ fontWeight: '800', color: '#C2410C' }}>공급처 미배정 품목</Text>{data.unmappedItems.map((i, index) => <Muted key={index}>{i.name} · {i.qtyText}</Muted>)}</Card> : null}
    </>}
  </ScrollView></Page>
}
