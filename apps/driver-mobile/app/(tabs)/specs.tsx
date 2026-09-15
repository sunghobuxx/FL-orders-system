import * as Print from 'expo-print'
import { useRef, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'

import { Card, Empty, Loading, Muted, Page, Pill, colors } from '../../components'
import { DateSelector } from '../../components/DateSelector'
import { useDriverResource } from '../../hooks/useDriverResource'
import { fmtWon, getKstToday } from '../../lib/format'

type SpecsResponse = {
  specs: Array<{
    id: string
    restaurantName: string
    businessDate: string
    totalAmount: number
    previousOutstanding: number
    outstanding: number
    itemCount: number
    lines: Array<{ id: string; productName: string; qty: number; unit: string; unitPrice: number; amount: number }>
  }>
}

export default function SpecsScreen() {
  const [date, setDate] = useState(getKstToday())
  const { data, loading, refreshing, refresh, error } = useDriverResource<SpecsResponse>(
    `/api/driver/specs?mode=today&date=${date}`, '명세서',
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

function createSpecHtml(spec: SpecsResponse['specs'][number]) {
  const [, month, day] = spec.businessDate.split('-')
  const printDateLabel = `${Number(month)}월 ${Number(day)}일`
  const rows = spec.lines.map((line) => `
    <tr>
      <td>${escapeHtml(line.productName)}</td>
      <td class="center">${formatQty(line.qty)} ${escapeHtml(line.unit)}</td>
      <td class="right">₩ ${formatNumber(line.unitPrice)}</td>
      <td class="right strong">₩ ${formatNumber(line.amount)}</td>
    </tr>
  `).join('')
  const emptyRows = Array.from({ length: Math.max(0, 3 - spec.lines.length) }, () => `
    <tr><td>&nbsp;</td><td></td><td></td><td class="right">₩ -</td></tr>
  `).join('')

  return `<!DOCTYPE html>
  <html lang="ko">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        @page { size: A4; margin: 10mm; }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 10mm; color: #000; background: #fff; font-family: Arial, "Malgun Gothic", sans-serif; font-size: 11pt; }
        h2 { margin: 0 0 6mm; text-align: center; font-size: 16pt; }
        table { width: 100%; border-collapse: collapse; }
        td, th { border: 1px solid #000; padding: 4px 8px; font-size: 10pt; }
        .info td { border: 0; line-height: 1.8; }
        .recipient { margin-bottom: 3mm; padding: 4px 0; border-bottom: 1px solid #000; font-size: 12pt; font-weight: 700; }
        .sub { margin-bottom: 4mm; font-size: 10pt; }
        .bg { background: #f0f0f0; }
        .center { text-align: center; }
        .right { text-align: right; }
        .strong { font-weight: 700; }
        .summary { margin-top: 2mm; }
        .summary td:first-child { width: 60%; border: 0; }
        .memo { margin-top: 3mm; }
      </style>
    </head>
    <body>
      <h2>${printDateLabel} 발주 명세표</h2>
      <table class="info">
        <tbody>
          <tr>
            <td style="width:50%;border-bottom:1px solid #000;padding-bottom:3px">${spec.businessDate}</td>
            <td style="width:50%;text-align:right;vertical-align:top">
              상호: 커넥티드 &nbsp; 성명: 김성호<br />
              사업장 소재지: 인천 남동구 청능대로 559<br />
              전화번호: 010-8680-5475
            </td>
          </tr>
        </tbody>
      </table>
      <div class="recipient">${escapeHtml(spec.restaurantName)} 귀하</div>
      <div class="sub">아래와 같이 계산합니다.</div>
      <table>
        <thead>
          <tr>
            <th class="bg" style="width:38%">품목명</th>
            <th class="bg" style="width:18%">수량</th>
            <th class="bg" style="width:18%">단가</th>
            <th class="bg" style="width:26%">공급가</th>
          </tr>
        </thead>
        <tbody>${rows}${emptyRows}</tbody>
      </table>
      <table class="summary">
        <tbody>
          <tr><td></td><td class="bg center strong">합계</td><td class="right strong">₩ ${formatNumber(spec.totalAmount)}</td></tr>
          ${spec.businessDate === getKstToday() ? `<tr><td></td><td class="bg center">전일미수금</td><td class="right strong">₩ ${formatNumber(spec.previousOutstanding)}</td></tr>` : ''}
          <tr><td></td><td class="bg center">${spec.businessDate === getKstToday() ? '금일미수금' : '조회 시점 미수금'}</td><td class="right strong">₩ ${formatNumber(spec.outstanding)}</td></tr>
        </tbody>
      </table>
      <table class="memo">
        <tbody>
          <tr><td class="bg center strong">기타사항</td></tr>
          <tr><td style="height:20mm">&nbsp;</td></tr>
        </tbody>
      </table>
    </body>
  </html>`
}

function formatQty(qty: number) {
  return Number.isInteger(qty) ? String(qty) : String(Number(qty.toFixed(1)))
}

function formatNumber(value: number) {
  return Number(value ?? 0).toLocaleString('ko-KR')
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
