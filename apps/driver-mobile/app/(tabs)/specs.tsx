import * as Print from 'expo-print'
import { useRef, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'

import { Card, Empty, Loading, Muted, Page, Pill, colors } from '../../components'
import { DateSelector } from '../../components/DateSelector'
import { useDriverResource } from '../../hooks/useDriverResource'
import { fmtWon, getKstToday } from '../../lib/format'
import { PRICE_STATUS_COLORS, priceStatusText, type SpecPriceStatus } from '../../lib/price-status'
import { createSpecHtml, type PrintableSpec } from '../../lib/spec-print'

type SpecsResponse = { specs: PrintableSpec[] }

export default function SpecsScreen() {
  const [date, setDate] = useState(getKstToday())
  const { data, loading, refreshing, refresh, error } = useDriverResource<SpecsResponse>(
    `/api/driver/specs?mode=today&date=${date}`, '명세서', 5000,
  )
  const [printingSpecId, setPrintingSpecId] = useState<string | null>(null)
  const printLockRef = useRef(false)

  async function printSpec(spec: SpecsResponse['specs'][number]) {
    if (printLockRef.current) return

    printLockRef.current = true
    setPrintingSpecId(spec.id)
    try {
      await Print.printAsync({ html: createSpecHtml(spec) })
    } catch (error) {
      const message = error instanceof Error ? error.message : '인쇄 화면을 열지 못했습니다.'
      if (message.includes('Another print request is already in progress')) return
      Alert.alert('명세서 프린트', message)
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 800))
      printLockRef.current = false
      setPrintingSpecId(null)
    }
  }

  if (loading) return <Loading />

  return (
    <Page>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink, marginBottom: 4 }}>명세서</Text>
        <Muted>담당 업체 명세서만 표시됩니다.</Muted>
        <DateSelector value={date} onChange={setDate} />
        {error ? <Muted>조회 실패: {error} · 아래로 당겨 다시 시도해 주세요.</Muted> : null}
        {!data?.specs.length ? <Empty message="명세서가 없습니다." /> : data.specs.map((spec) => (
          <Card key={spec.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: '900', color: colors.ink }}>{spec.restaurantName}</Text>
              <Pill tone="green">{fmtWon(spec.totalAmount)}</Pill>
            </View>
            <Muted>{spec.businessDate} · {spec.itemCount}개 품목</Muted>
            <PriceStatusBadge value={spec.priceStatus} />
            <View style={{ marginTop: 10 }}>
              {spec.lines.map((line) => (
                <View key={line.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line }}>
                  <Text style={{ color: colors.ink, fontWeight: '700' }}>{line.productName}</Text>
                  <Text style={{ color: colors.muted }}>{line.qty}{line.unit} · {fmtWon(line.amount)}</Text>
                </View>
              ))}
            </View>
            <Pressable
              onPress={() => void printSpec(spec)}
              disabled={printingSpecId !== null}
              style={({ pressed }) => ({
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 12,
                minHeight: 44,
                borderRadius: 10,
                backgroundColor: printingSpecId !== null ? '#9CA3AF' : pressed ? '#111827' : '#1F2937',
              })}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>
                {printingSpecId === spec.id ? '인쇄 화면 여는 중...' : '명세서 프린트'}
              </Text>
            </Pressable>
          </Card>
        ))}
      </ScrollView>
    </Page>
  )
}

function PriceStatusBadge({ value }: { value?: SpecPriceStatus | null }) {
  const text = priceStatusText(value)
  if (!value || !text) return null
  const palette = PRICE_STATUS_COLORS[value.status]
  return (
    <View style={{ alignSelf: 'flex-start', maxWidth: '100%', marginTop: 8, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: palette.backgroundColor }}>
      <Text style={{ color: palette.color, fontSize: value.status === 'final' ? 12 : 13, lineHeight: 19, fontWeight: value.status === 'final' ? '500' : '800' }}>{text}</Text>
    </View>
  )
}
