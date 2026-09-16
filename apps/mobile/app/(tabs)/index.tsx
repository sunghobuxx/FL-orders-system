import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, AppState, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg'
import { MEMBER_API_URL } from '@/lib/member-api'
import { supabase } from '@/lib/supabase'
import { useNotices } from '@/hooks/use-notices'

type Trend = { name: string; unit: string; points: { date: string; value: number }[]; currentPrice: number; changeRate: number; qty: number; totalCost: number; orderDays: number; deliveryDays: number; start: string; today: string }
type Supply = { ours: string[]; name: string; unit: string; recentAvg: number; priorAvg: number; changeRate: number; risk: 'critical' | 'high' | 'watch' | 'safe' }
type Dashboard = {
  todayStatus: string | null; yesterdayTotal: number; monthTotal: number; outstanding: number; recentDates: string[];
  inquiries: { id: string; title: string; status: string }[]; trend: Trend | null;
  supplyRows: Supply[]; supplyError: string | null;
  insight: { insight_text: string | null; model: string | null; created_at: string | null; data_summary: { weeks?: number; products?: string[] } | null } | null;
}
const money = (n: number) => n.toLocaleString('ko-KR') + '원'
const qty = (n: number, unit: string) => Number(n.toFixed(1)).toLocaleString('ko-KR') + unit
const risks = { critical: ['매우위험', '#dc2626', '#fef2f2'], high: ['위험', '#ef4444', '#fef2f2'], watch: ['주의', '#ca8a04', '#fefce8'], safe: ['안정', '#16a34a', '#f0fdf4'] }
function Card({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return <View style={s.card}><View style={s.header}><Text style={s.title}>{title}</Text>{right}</View><View style={s.body}>{children}</View></View>
}
function Action({ children, onPress, filled = false }: { children: ReactNode; onPress: () => void; filled?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" onPress={onPress} style={filled ? s.button : undefined}><Text style={filled ? s.buttonText : s.link}>{children}</Text></TouchableOpacity>
}
function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <View style={[s.metric, danger && s.redBg]}><Text style={s.muted}>{label}</Text><Text adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={1} style={[s.amount, danger && s.red]}>{value}</Text></View>
}
function Chart({ trend, mini = false }: { trend: Trend; mini?: boolean }) {
  const points = trend.points
  if (!points.length) return <Text style={s.empty}>최근 2주 단가 데이터가 없습니다.</Text>
  const width = 620, height = mini ? 110 : 230, left = mini ? 8 : 54, right = 25, top = 24, bottom = mini ? 8 : 36
  const min = Math.max(0, Math.floor(Math.min(...points.map(p => p.value)) * .85 / 1000) * 1000)
  const max = Math.max(min + 1, Math.ceil(Math.max(...points.map(p => p.value)) * 1.1 / 1000) * 1000)
  const x = (i: number) => left + (points.length === 1 ? width - left - right : i * (width - left - right) / (points.length - 1))
  const y = (v: number) => top + (height - top - bottom) * (1 - (v - min) / (max - min))
  const path = points.map((p, i) => (i ? 'L' : 'M') + ' ' + x(i) + ' ' + y(p.value)).join(' ')
  const last = points.length - 1, color = mini ? '#ef4444' : '#2563eb'
  return <Svg width="100%" height={mini ? 80 : 180} viewBox={'0 0 ' + width + ' ' + height} accessibilityLabel="납품 단가 추이">
    {!mini && Array.from({ length: 5 }, (_, i) => { const v = max - (max - min) * i / 4; return <Line key={i} x1={left} x2={width - right} y1={y(v)} y2={y(v)} stroke="#e5e7eb"/> })}
    {!mini && Array.from({ length: 5 }, (_, i) => { const v = max - (max - min) * i / 4; return <SvgText key={i} x={left - 7} y={y(v) + 4} fontSize={12} fill="#9ca3af" textAnchor="end">{Math.round(v / 1000)}k</SvgText> })}
    {!mini && points.map((p, i) => (i % 3 === 0 || i === last) && <SvgText key={p.date} x={x(i)} y={height - 10} textAnchor="middle" fontSize={12} fill="#9ca3af">{Number(p.date.slice(5, 7))}/{Number(p.date.slice(8))}</SvgText>)}
    {mini && <Path d={path + ' L ' + x(last) + ' ' + (height - bottom) + ' L ' + x(0) + ' ' + (height - bottom) + ' Z'} fill="#ef4444" fillOpacity={0.08}/>}
    <Path d={path} fill="none" stroke={color} strokeWidth={mini ? 3 : 2.5}/><Circle cx={x(last)} cy={y(points[last].value)} r={3.5} fill={color}/>
    {!mini && <SvgText x={x(last) - 2} y={y(points[last].value) - 9} fontSize={12} textAnchor="end" fill={color}>{money(points[last].value)}</SvgText>}
  </Svg>
}
export default function HomeScreen() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const generation = useRef(0)
  const { notices, error: noticeError, refresh: refreshNotices } = useNotices(3)
  const load = useCallback(async () => {
    const request = ++generation.current, controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('로그인 상태를 확인해주세요.')
      const response = await fetch(MEMBER_API_URL + '/api/member/dashboard-analysis', { headers: { Authorization: 'Bearer ' + session.access_token }, signal: controller.signal })
      const payload = await response.json() as { webDashboard?: Dashboard; error?: string }
      if (!response.ok) throw new Error(payload.error ?? '대시보드를 불러오지 못했습니다.')
      if (!payload.webDashboard) throw new Error('이 대시보드에 필요한 서버 API가 아직 배포되지 않았습니다.')
      if (request === generation.current) { setData(payload.webDashboard); setError(null) }
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : '연결이 지연되고 있습니다. 다시 시도해주세요.')
    } finally {
      clearTimeout(timeout)
      if (request === generation.current) { setLoading(false); setRefreshing(false) }
    }
  }, [])
  useFocusEffect(useCallback(() => {
    void load()
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void load() })
    const timer = setInterval(() => { if (AppState.currentState === 'active') void load() }, 60000)
    return () => { generation.current++; listener.remove(); clearInterval(timer) }
  }, [load]))
  const refresh = () => { setRefreshing(true); void load(); void refreshNotices() }
  const settlement = () => router.push('/settlement')
  if (loading && !data) return <View style={s.center}><ActivityIndicator color="#16a34a"/></View>
  const t = data?.trend, insight = data?.insight
  const risky = data?.supplyRows.filter(row => row.risk !== 'safe') ?? []
  return <ScrollView style={s.container} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>}>
    {error && <TouchableOpacity onPress={refresh} style={s.error}><Text style={s.red}>{error} · 다시 시도</Text>{data && <Text style={s.muted}>마지막 조회 결과입니다.</Text>}</TouchableOpacity>}
    {data && <>
      <View style={s.row}>
        <TouchableOpacity style={s.topCard} onPress={() => router.push('/order')}><Text style={s.muted}>금일 발주 내역</Text><Text style={s.amount}>{data.todayStatus === 'submitted' ? '발주완료' : data.todayStatus === 'confirmed' ? '확정됨' : data.todayStatus ? '진행중' : '미발주'}</Text>{!data.todayStatus && <Text style={s.link}>발주하기 →</Text>}</TouchableOpacity>
        <TouchableOpacity style={s.topCard} onPress={settlement}><Text style={s.muted}>전일 발주 내역</Text><Text numberOfLines={1} adjustsFontSizeToFit style={s.amount}>{money(data.yesterdayTotal)}</Text></TouchableOpacity>
      </View>
      <Card title="이번 달 납품 현황" right={<Action onPress={settlement}>전체 내역 →</Action>}>
        <View style={s.row}><Metric label="납품 합계" value={money(data.monthTotal)}/><Metric label="미수금" value={money(data.outstanding)} danger={data.outstanding > 0}/></View>
        <Text style={[s.muted, { marginTop: 12 }]}>최근 납품일</Text><View style={s.wrap}>{data.recentDates.map(date => <TouchableOpacity key={date} style={s.chip} onPress={() => router.push({ pathname: '/spec' as never, params: { date } })}><Text style={s.link}>{date}</Text></TouchableOpacity>)}</View>
      </Card>
      {data.outstanding > 0 && <View style={[s.payment, s.redBg]}><View style={{ flex: 1 }}><Text style={s.muted}>미결제</Text><Text style={[s.amount, s.red]}>{money(data.outstanding)}</Text></View><Action filled onPress={settlement}>결제하기</Action></View>}
      <Card title="납품 단가 2주 추이" right={t && <Text style={s.small}>{t.start} ~ {t.today}</Text>}>{t ? <><Chart trend={t}/><Text style={s.label}>━━  {t.name}</Text></> : <Text style={s.empty}>최근 2주 단가 데이터가 없습니다.</Text>}</Card>
      <Card title="현재 납품 단가" right={<Action onPress={() => setExpanded(v => !v)}>{expanded ? '접기 ∧' : '펼치기 ∨'}</Action>}>
        {expanded && (t ? <View style={s.row}><Text style={s.label}>{t.name}</Text><View style={s.bar}><View style={[s.barFill, { width: '88%', backgroundColor: '#e5e7eb' }]}/></View><Text style={s.bold}>{money(t.currentPrice)}/{t.unit}</Text></View> : <Text style={s.empty}>납품 단가 데이터가 없습니다.</Text>)}
      </Card>
      <Card title="이번 주 납품 분석" right={<Text style={s.small}>월~토</Text>}>
        {t ? <><View style={s.row}><Metric label="발주일" value={t.deliveryDays + '일'}/><Metric label="주간 비용" value={money(t.totalCost)}/><Metric label="일평균" value={money(Math.round(t.totalCost / t.orderDays))}/></View>
          <View style={s.analysis}><View style={s.row}><Text style={[s.bold, { flex: 1 }]}>🔵 {t.name}</Text><View><Text style={s.bold}>{money(t.currentPrice)}/{t.unit}</Text><Text style={{ textAlign: 'right', color: t.changeRate >= 0 ? '#ef4444' : '#2563eb' }}>{t.changeRate >= 0 ? '▲' : '▼'} {Math.abs(t.changeRate).toFixed(1)}%</Text></View></View><Chart trend={t} mini/>
            <View style={s.row}><Metric label="주간 발주량" value={qty(t.qty, t.unit)}/><Metric label="일평균" value={qty(t.qty / t.orderDays, t.unit)}/><Metric label="주간 비용" value={money(t.totalCost)}/></View>
          </View><Text style={s.foot}>최근 2주 ({t.start} ~ {t.today}) · 차트: 2주간 단가 추이</Text></> : <Text style={s.empty}>납품 분석 데이터가 없습니다.</Text>}
      </Card>
      <Card title="수급위험 예측 · 구매 어드바이스" right={<Text style={s.small}>가락시장 반입량</Text>}>
        <View style={s.analysis}><Text style={s.bold}>이번 주 수급위험 브리핑</Text>{data.supplyError ? <Text style={s.red}>{data.supplyError}</Text> : !data.supplyRows.length ? <Text style={s.muted}>주문 품목 중 가락시장 반입량 자료가 있는 품목이 없습니다.</Text> : !risky.length ? <Text style={s.link}>✅ 주문 품목 전체 반입량 안정 — 평소 발주량 유지</Text> : risky.map(row => <Text key={row.name} style={s.label}>· {row.ours.join('·')} {risks[row.risk][0]} — {row.risk === 'watch' ? '발주 시점 / 재고 확인' : '2~3일치 선발주 검토'}</Text>)}</View>
        {data.supplyRows.map(row => { const [label, color, bg] = risks[row.risk]; return <View key={row.name} style={[s.supply, { backgroundColor: bg, borderColor: color + '40' }]}>
          <View style={s.wrap}><Text style={[s.bold, { flexGrow: 1 }]}>{row.ours.join('·')} <Text style={s.muted}>{row.name}</Text></Text><Text style={{ color: row.changeRate < 0 ? '#ef4444' : '#2563eb' }}>{row.changeRate > 0 ? '+' : ''}{row.changeRate.toFixed(1)}%</Text><Text style={{ color, fontWeight: '700' }}>{label}</Text></View>
          <View style={s.supplyBody}><Text style={s.small}>서울가락 일평균 반입량 · 최근 7일 vs 직전 7일</Text>
            {([['직전', row.priorAvg, 100, '#9ca3af'], ['최근', row.recentAvg, Math.min(100, Math.max(8, row.priorAvg > 0 ? row.recentAvg / row.priorAvg * 100 : 0)), color]] as const).map(([name, value, width, barColor]) => <View key={name} style={s.row}><Text style={s.muted}>{name}</Text><View style={s.bar}><View style={[s.barFill, { width: (width + '%') as `${number}%`, backgroundColor: barColor }]}/></View><Text style={[s.label, { minWidth: 82, textAlign: 'right' }]}>{qty(Math.round(value), row.unit)}</Text></View>)}
          </View></View> })}
        <Text style={[s.title, { marginVertical: 16 }]}>✨ 구매 운영 어드바이스 <Text style={s.small}>{insight?.model?.startsWith('gemini:') ? 'Gemini 분석' : 'AI 분석'}</Text></Text>
        {insight?.insight_text ? insight.insight_text.split('\n').filter(Boolean).map((line, i) => <Text key={i} style={s.advice}>{line}</Text>) : <Text style={s.empty}>저장된 AI 분석이 없습니다.</Text>}
        <Text style={s.foot}>AI 분석은 참고용입니다. {insight?.created_at ? new Date(insight.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : ''}{insight?.data_summary?.weeks ? ' · ' + insight.data_summary.weeks + '주' : ''}{insight?.data_summary?.products ? ' · 품목 ' + insight.data_summary.products.length + '개' : ''}</Text>
      </Card>
    </>}
    <Card title="공지사항" right={<Action onPress={() => router.push('/notices')}>전체보기 →</Action>}>
      {noticeError && <Action onPress={() => void refreshNotices()}>{noticeError} · 다시 시도</Action>}
      {notices.map(item => <TouchableOpacity key={item.id} style={s.listRow} onPress={() => router.push(('/notice/' + item.id) as never)}><Text style={[s.label, { flex: 1 }]} numberOfLines={1}>{item.title}</Text><Text style={s.small}>{new Date(item.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' })}</Text></TouchableOpacity>)}
      {!noticeError && !notices.length && <Text style={s.empty}>공지사항이 없습니다.</Text>}
    </Card>
    <Card title="불편 & 문의" right={<Action filled onPress={() => router.push('/inquiry/new')}>글쓰기</Action>}>
      {data?.inquiries.map(item => <TouchableOpacity key={item.id} style={s.listRow} onPress={() => router.push(('/inquiry/' + item.id) as never)}><Text style={[s.label, { flex: 1 }]} numberOfLines={1}>{item.title}</Text><Text style={s.link}>{['answered', 'resolved'].includes(item.status) ? '답변완료' : '대기중'}</Text></TouchableOpacity>)}
      {data && !data.inquiries.length && <Text style={s.empty}>문의 내역이 없습니다.</Text>}{!data && <Text style={s.empty}>대시보드 조회 후 문의 내역을 확인할 수 있습니다.</Text>}
    </Card>
  </ScrollView>
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' }, content: { padding: 14, paddingBottom: 28, gap: 16 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, overflow: 'hidden' },
  header: { backgroundColor: '#f9fafb', borderBottomWidth: 1, borderColor: '#e5e7eb', padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }, body: { padding: 14 },
  title: { fontSize: 15, color: '#374151', fontWeight: '700' }, small: { fontSize: 10, color: '#9ca3af' }, muted: { fontSize: 12, color: '#9ca3af' }, label: { fontSize: 13, color: '#4b5563' }, bold: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 },
  topCard: { flex: 1, alignSelf: 'stretch', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, backgroundColor: '#fff', gap: 8 },
  metric: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 8, padding: 10, gap: 6 }, amount: { fontSize: 20, fontWeight: '800', color: '#1f2937' },
  red: { color: '#dc2626' }, redBg: { backgroundColor: '#fef2f2' }, payment: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderWidth: 1, borderColor: '#fecaca', borderRadius: 12 },
  link: { fontSize: 12, color: '#16a34a', fontWeight: '500' }, button: { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 }, buttonText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  chip: { backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  bar: { flex: 1, height: 8, backgroundColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden' }, barFill: { height: '100%', borderRadius: 8 },
  analysis: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 12, marginTop: 14, gap: 10 },
  supply: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 }, supplyBody: { padding: 10, backgroundColor: '#fff', borderRadius: 8, marginTop: 8, gap: 7 },
  advice: { fontSize: 14, color: '#1f2937', lineHeight: 26, marginBottom: 14 }, foot: { fontSize: 10, color: '#9ca3af', marginTop: 12, textAlign: 'right', lineHeight: 16 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f3f4f6' }, empty: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 18 }, error: { backgroundColor: '#fef2f2', borderRadius: 8, padding: 14 },
})
