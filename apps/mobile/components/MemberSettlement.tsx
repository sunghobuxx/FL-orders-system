import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import * as Print from 'expo-print'
import { MEMBER_API_URL, memberRequest } from '@/lib/member-api'
import { statementHtml, type SettlementData, type StatementSpec } from '@/lib/statement'

let printing = false
const today = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
const shift = (date: string, days: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
const won = (n: number) => `${Number(n).toLocaleString()}원`

export default function MemberSettlement({ specOnly = false }: { specOnly?: boolean }) {
  const params = useLocalSearchParams<{ date?: string }>()
  const [date, setDate] = useState(params.date ?? today())
  const [draftDate, setDraftDate] = useState(params.date ?? today())
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const [month, setMonth] = useState(today().slice(0, 7))
  const [data, setData] = useState<SettlementData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [printBusy, setPrintBusy] = useState(false)
  const [tab, setTab] = useState<'summary' | 'history'>(params.date ? 'history' : 'summary')
  const sequence = useRef(0)
  useEffect(() => { if (params.date) { setDate(params.date); setDraftDate(params.date) } }, [params.date])
  const load = useCallback(async () => {
    const id = ++sequence.current
    setLoading(true)
    try {
      const query = new URLSearchParams({ date, ...(range ?? {}) })
      const result = await memberRequest<SettlementData>(`/settlement?${query}`)
      if (sequence.current === id) { setData(result); setError('') }
    } catch (e) { if (sequence.current === id) setError(e instanceof Error ? e.message : '정산 조회 실패') }
    finally { if (sequence.current === id) setLoading(false) }
  }, [date, range])
  useFocusEffect(useCallback(() => { void load(); return () => { sequence.current++ } }, [load]))
  async function print(specs: StatementSpec[]) {
    if (!data || printing || !specs.length || loading || error) return
    printing = true; setPrintBusy(true)
    try { await Print.printAsync({ html: statementHtml(data.organizationName, specs, data.lines, data.outstanding) }) }
    catch { Alert.alert('인쇄', '인쇄가 취소되었거나 프린터를 연결하지 못했습니다.') }
    finally { printing = false; setPrintBusy(false) }
  }
  function payment(amount: number) {
    if (amount <= 0 || loading || error) return
    const query = new URLSearchParams({ amount: String(amount), orderName: '미수금 결제', refType: 'receivable' })
    Alert.alert('웹 결제', '웹과 동일한 결제 화면을 엽니다. 브라우저에 로그인되어 있지 않으면 로그인 후 진행해주세요.', [
      { text: '취소', style: 'cancel' }, { text: '결제 화면 열기', onPress: () => void Linking.openURL(`${MEMBER_API_URL}/mobile-payment?${query}`).catch(() => Alert.alert('오류', '결제 화면을 열지 못했습니다.')) },
    ])
  }
  function changeDate(value: string) {
    const parsed = new Date(`${value}T00:00:00Z`)
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) { Alert.alert('날짜', '올바른 날짜를 입력해주세요.'); return }
    setDate(value); setDraftDate(value)
  }
  const button = (label: string, press: () => void, disabled = false) => <TouchableOpacity disabled={disabled} style={[s.button, disabled && { opacity: .45 }]} onPress={press}><Text style={s.buttonText}>{label}</Text></TouchableOpacity>
  function statement(spec: StatementSpec) {
    return <View key={spec.id} style={s.card}>
      <Text style={s.heading}>{spec.business_date} 명세서</Text>
      <View style={s.line}><Text style={[s.name, s.bold]}>품목</Text><Text style={s.cell}>수량</Text><Text style={s.cell}>단가</Text><Text style={s.cell}>금액</Text></View>
      {data?.lines.filter(l => l.specId === spec.id).map(line => <View key={line.id} style={s.line}><Text style={s.name}>{line.name}</Text><Text style={s.cell}>{line.qty}{line.unit}</Text><Text style={s.cell}>{Number(line.unitPrice).toLocaleString()}</Text><Text style={s.cell}>{Number(line.amount).toLocaleString()}</Text></View>)}
      <Text style={s.total}>합계금액: {won(spec.total_amount)}</Text>
      {button(printBusy ? '인쇄 중…' : '명세서 프린트', () => void print([spec]), printBusy || loading || !!error)}
    </View>
  }
  return <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    {!specOnly && <View style={s.row}>{button('정산', () => { setTab('summary'); setRange(null) })}{button('명세서 내역', () => setTab('history'))}</View>}
    {error && <View style={s.card}><Text style={s.error}>{error}</Text>{button('다시 조회', () => void load())}</View>}
    {loading && <ActivityIndicator color="#16a34a"/>}
    {data && <>
      <Text style={s.heading}>{data.organizationName}</Text>
      <View style={s.card}><Text>조회 시점 미수금 · {data.cycle === 'weekly' ? '주정산' : '월정산'}</Text><Text style={[s.total, s.error]}>{won(data.outstanding)}</Text>{button('전체 미수금 결제', () => payment(data.outstanding), !data.outstanding || loading || !!error)}</View>
    </>}
    {(specOnly || tab === 'history') && <View style={s.card}>
      <View style={s.row}>{button('‹', () => changeDate(shift(date, -1)))}<Text style={s.heading}>{date}</Text>{button('›', () => changeDate(shift(date, 1)))}</View>
      <View style={s.row}><TextInput accessibilityLabel="명세서 날짜" style={s.input} placeholder="YYYY-MM-DD" value={draftDate} onChangeText={setDraftDate}/>{button('조회', () => { if (/^\d{4}-\d{2}-\d{2}$/.test(draftDate)) changeDate(draftDate); else Alert.alert('날짜', 'YYYY-MM-DD 형식으로 입력해주세요.') })}{button('오늘', () => changeDate(today()))}</View>
    </View>}
    {data && (specOnly || tab === 'summary') && <>
      <Text style={s.heading}>{specOnly ? '납품 명세서' : '당일 명세서'}</Text><Text style={s.muted}>최종금액은 13시 전에 업로드됩니다.</Text>
      {data.selectedSpec ? statement(data.selectedSpec) : <Text style={s.muted}>{date} 납품 내역이 없습니다.</Text>}
    </>}
    {!specOnly && tab === 'history' && <View style={s.card}>
      <Text style={s.heading}>월별 납품 내역</Text><View style={s.row}><TextInput accessibilityLabel="조회 월" style={s.input} placeholder="YYYY-MM" value={month} onChangeText={setMonth}/>{button('월 조회', () => {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) { Alert.alert('조회 월', 'YYYY-MM 형식으로 입력해주세요.'); return }
        const end = new Date(`${month}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1, 0)
        setRange({ from: `${month}-01`, to: end.toISOString().slice(0, 10) })
      })}</View>
      {data && <><Text>이전 미수금: {won(data.previousOutstanding)}</Text>{button('조회 기간 프린트', () => void print(data.periods.flatMap(p => p.specs)), loading || printBusy || !!error || !data.periods.length)}</>}
    </View>}
    {data && !specOnly && data.periods.map(period => <View key={period.key} style={s.card}>
      <Text style={s.heading}>{period.start} ~ {period.end}</Text><Text>납품 합계: {won(period.total)}</Text>
      <Text style={period.outstanding > 0 ? s.error : s.muted}>{period.outstanding > 0 ? `미수금: ${won(period.outstanding)}` : period.billed ? '완납' : '청구 전'}</Text>
      {tab === 'history' && period.specs.map(spec => <View key={spec.id}>{statement(spec)}</View>)}
      {tab === 'summary' && period.specs.map(spec => <TouchableOpacity key={spec.id} style={s.line} onPress={() => router.push({ pathname: '/spec' as never, params: { date: spec.business_date } })}><Text style={s.link}>{spec.business_date} 명세서 →</Text><Text>{won(spec.total_amount)}</Text></TouchableOpacity>)}
      {button('기간 미수금 결제', () => payment(period.outstanding), period.outstanding <= 0 || loading || !!error)}
    </View>)}
  </ScrollView>
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' }, content: { padding: 14, gap: 12, paddingBottom: 30 },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', gap: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }, heading: { fontSize: 15, fontWeight: '700', color: '#374151' },
  total: { fontSize: 21, fontWeight: '700', textAlign: 'right' }, muted: { color: '#9ca3af', fontSize: 12 }, error: { color: '#dc2626' },
  button: { backgroundColor: '#16a34a', borderRadius: 8, padding: 10, alignItems: 'center' }, buttonText: { color: 'white', fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5, borderBottomWidth: 1, borderColor: '#f3f4f6', paddingVertical: 10 },
  name: { flex: 1.5, fontSize: 12 }, cell: { flex: 1, fontSize: 11, textAlign: 'right' }, bold: { fontWeight: '700' }, link: { color: '#16a34a' }, input: { flex: 1, minWidth: 120, padding: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 8 },
})
