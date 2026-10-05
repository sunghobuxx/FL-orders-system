import { useRef, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { Card, Empty, Loading, Muted, Page, Pill, colors } from '../../components'
import { DateSelector } from '../../components/DateSelector'
import { useDriverResource } from '../../hooks/useDriverResource'
import { apiPost } from '../../lib/api'
import { fmtWon } from '../../lib/format'
import { defaultDispatchDate, type DispatchResponse, type DispatchRow } from '../../lib/dispatch'
import { nextOrderCheckStage, orderCheckState } from '../../lib/order-check'

export default function HistoryScreen() {
  const [date, setDate] = useState(defaultDispatchDate)
  const [tab, setTab] = useState<'all' | 'garak' | 'suppliers'>('all')
  const [checking, setChecking] = useState(false)
  const lock = useRef(false)
  const { data, loading, refreshing, error, load, refresh } = useDriverResource<DispatchResponse>(`/api/driver/dispatch?date=${date}`, '발주 내역')

  async function toggle(row: DispatchRow) {
    if (lock.current || !row.canManage || !row.batchId) return
    const stage = nextOrderCheckStage(row.batchStatus, row.checkStage)
    if (stage === null) return
    lock.current = true
    setChecking(true)
    try {
      await apiPost('/api/driver/orders/check-items', { batchId: row.batchId, itemIds: [row.orderItemId], stage })
      await load()
    } catch (e: any) {
      Alert.alert('확인 실패', e.message)
    } finally { lock.current = false; setChecking(false) }
  }

  function itemRow(row: DispatchRow) {
    const { done, requiredStage } = orderCheckState(row.batchStatus)
    const checked = row.checkStage >= requiredStage
    const disabled = checking || !!error || done || !row.canManage || !row.batchId || row.excluded
    return <View key={row.orderItemId} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line, gap: 6 }}>
      <Text style={{ color: colors.ink, fontWeight: '800' }}>{row.name} · {row.restaurantName || '업체 미확인'}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, color: colors.muted }}>{row.qty}{row.unit}{row.unitPrice > 0 ? ` · 단가 ${fmtWon(row.unitPrice)}` : ''}{row.excluded ? ' · 발주 제외' : ''}</Text>
        <Pressable accessibilityRole="button" disabled={!!disabled} onPress={() => void toggle(row)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, backgroundColor: checked ? '#DCFCE7' : colors.green, opacity: disabled ? 0.55 : 1 }}>
          <Text style={{ fontWeight: '800', color: checked ? '#166534' : 'white' }}>{!row.canManage ? '조회 전용' : done ? '배송완료' : `${checked ? '✓ ' : ''}${requiredStage === 1 ? '상차' : '배송'}`}</Text>
        </Pressable>
      </View>
    </View>
  }

  return <Page><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
    <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink }}>발주내역</Text>
    <View pointerEvents={checking ? 'none' : 'auto'}><DateSelector value={date} onChange={setDate} /></View>
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
      {(['all', 'garak', 'suppliers'] as const).map((value, index) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={{ flex: 1, alignItems: 'center', padding: 12, borderRadius: 8, backgroundColor: tab === value ? colors.green : colors.soft }}><Text style={{ fontWeight: '800', color: tab === value ? 'white' : colors.ink }}>{['전체', '가락', '기존'][index]}</Text></Pressable>)}
    </View>
    {error ? <Muted>조회 실패: {error} · 아래로 당겨 다시 시도해 주세요.</Muted> : null}
    {loading ? <Loading /> : !data ? <Empty message="조회된 내역이 없습니다." /> : <>
      {tab === 'all' ? <>
        <Muted>당일 발주 집계 (전체) · {data.businessDate}</Muted>
        <Text style={{ fontWeight: '800', marginVertical: 10 }}>총 {fmtWon(data.totalAmount)}</Text>
        {!data.totals.length ? <Empty message="이 날짜의 발주가 없습니다." /> : <Card>{data.totals.map(i => <View key={`${i.productId}-${i.unit}`} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 4 }}><Text style={{ fontWeight: '800' }}>{i.name} · {i.qtyText}</Text><Muted>{fmtWon(i.amount)}</Muted></View>)}</Card>}
      </> : tab === 'garak' ? <>
        <Muted>가락 매입 (서울·일산) — 발주 문자 없음</Muted>
        {!data.garakItems?.length ? <Empty message="가락 매입 품목이 없습니다." /> : <Card>{data.garakItems.map(itemRow)}</Card>}
      </> : <>
        <Muted>기존 공급처별 발주 내역</Muted>
        {!data.suppliers.length ? <Empty message="기존 공급처 발주가 없습니다." /> : data.suppliers.map(supplier => <Card key={supplier.supplierId}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1, fontWeight: '900', color: '#1E40AF' }}>{supplier.supplierName}</Text><Pill tone={supplier.sent ? 'green' : 'gray'}>{supplier.autoDispatchExcluded ? '자동발송 제외' : supplier.sent ? '전송완료' : '전송대기'}</Pill></View>
          {supplier.lines.map((line, i) => <View key={`${line.name}-${line.unit}-${i}`} style={{ marginTop: 12 }}><Text style={{ fontWeight: '800' }}>{line.name} · {line.qtyText}</Text>{line.rows.map(itemRow)}</View>)}
        </Card>)}
      </>}
      {tab !== 'garak' && data.unmappedItems.length ? <Card><Text style={{ fontWeight: '800', color: '#C2410C' }}>공급처 미배정 품목</Text>{data.unmappedItems.map((i, index) => <Muted key={index}>{i.name} · {i.qtyText}</Muted>)}</Card> : null}
    </>}
  </ScrollView></Page>
}
