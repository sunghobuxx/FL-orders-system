import { useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, AppState, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { SvgXml } from 'react-native-svg'
import qrcode from 'qrcode-generator'
import { MEMBER_API_URL, memberRequest } from '@/lib/member-api'
type Entry = { id: string; name: string; party_size: number; status: string; created_at: string }
type Result = { restaurant: { id: string; name: string; waitingEnabled: boolean }; entries: Entry[] }
const today = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
const move = (date: string, n: number) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export default function WaitingScreen() {
  const [date, setDate] = useState(today())
  const [data, setData] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const generation = useRef(0), busyRef = useRef(false)
  const load = useCallback(async () => {
    const id = ++generation.current; setLoading(true)
    try { const result = await memberRequest<Result>('/waiting?date=' + date); if (id === generation.current) { setData(result); setError('') } }
    catch (e) { if (id === generation.current) setError(e instanceof Error ? e.message : '웨이팅 조회 실패') }
    finally { if (id === generation.current) setLoading(false) }
  }, [date])
  useFocusEffect(useCallback(() => {
    void load()
    const timer = setInterval(() => { if (!busyRef.current && AppState.currentState === 'active') void load() }, 15000)
    const listener = AppState.addEventListener('change', state => { if (state === 'active' && !busyRef.current) void load() })
    return () => { generation.current++; clearInterval(timer); listener.remove() }
  }, [load]))
  const url = data ? MEMBER_API_URL + '/waiting/' + data.restaurant.id : ''
  const xml = useMemo(() => { if (!url) return ''; const qr = qrcode(0, 'M'); qr.addData(url); qr.make(); return qr.createSvgTag({ cellSize: 5, margin: 20, scalable: true }) }, [url])
  async function update(id: string, status: string) {
    if (busyRef.current || loading || error) return
    busyRef.current = true; setBusy(true)
    try {
      const response = await memberRequest<{ notificationSent: boolean }>('/waiting', { method: 'PATCH', body: JSON.stringify({ entryId: id, status }) })
      await load()
      if (status === 'called' && !response.notificationSent) Alert.alert('발송 확인 필요', '호출 상태는 저장됐지만 문자 발송에 실패했습니다. 고객에게 직접 안내해주세요.')
    } catch (e) { Alert.alert('처리 실패', e instanceof Error ? e.message : '상태를 변경하지 못했습니다.') }
    finally { busyRef.current = false; setBusy(false) }
  }
  const button = (text: string, action: () => void, disabled = false) => <TouchableOpacity disabled={busy || disabled} onPress={action} style={[s.button, (busy || disabled) && { opacity: .4 }]}><Text style={s.white}>{text}</Text></TouchableOpacity>
  const waiting = data?.entries.filter(e => !e.status || e.status === 'waiting').length ?? 0
  const called = data?.entries.filter(e => e.status === 'called').length ?? 0
  return <ScrollView style={s.page} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()}/>}>
    <View style={s.row}><Text style={s.title}>{data?.restaurant.name ?? ''} 웨이팅 관리</Text>{data?.restaurant.waitingEnabled && button('QR 보기', () => setShowQr(v => !v))}</View>
    <View style={s.row}>{button('‹', () => setDate(move(date, -1)))}<Text>{date}{date === today() ? ' · 오늘' : ''}</Text>{button('›', () => setDate(move(date, 1)), date >= today())}</View>
    {!!error && <View style={s.card}><Text style={s.error}>{error}</Text>{button('다시 시도', () => void load())}</View>}
    {!data && loading && <ActivityIndicator color="#16a34a"/>}
    {data && !data.restaurant.waitingEnabled && <Text style={s.muted}>웨이팅 기능이 활성화되지 않은 업장입니다. 관리자에게 문의해주세요.</Text>}
    {data?.restaurant.waitingEnabled && <>
      {showQr && <View style={[s.card, { alignItems: 'center' }]}><SvgXml xml={xml} width={200} height={200}/><Text selectable style={s.muted}>{url}</Text></View>}
      <View style={s.row}><Text>대기 {waiting}팀</Text><Text>호출 {called}팀</Text></View>
      {!data.entries.length && !error && <Text style={s.muted}>현재 대기 없음</Text>}
      {[...data.entries.filter(e => !e.status || ['waiting','called'].includes(e.status)), ...data.entries.filter(e => ['seated','cancelled','no_show'].includes(e.status))].map(entry => <View key={entry.id} style={s.card}>
        <View style={s.row}><Text style={s.title}>{entry.name} · {entry.party_size}명</Text><Text>{({ waiting: '대기중', called: '호출됨', seated: '입장완료', cancelled: '취소', no_show: '노쇼' } as Record<string,string>)[entry.status] ?? '대기중'}</Text></View>
        <Text style={s.muted}>{Math.max(0, Math.floor((Date.now() - Date.parse(entry.created_at))/60000))}분 전</Text>
        {(!entry.status || entry.status === 'waiting') && <View style={s.row}>{button('자리남 알림', () => Alert.alert('자리남 알림', entry.name + '님에게 입장 안내 문자를 발송할까요?', [{ text: '취소', style: 'cancel' }, { text: '발송', onPress: () => void update(entry.id, 'called') }]))}{button('취소', () => void update(entry.id, 'cancelled'))}</View>}
        {entry.status === 'called' && <View style={s.row}>{button('입장', () => void update(entry.id, 'seated'))}{button('노쇼', () => void update(entry.id, 'no_show'))}</View>}
      </View>)}
    </>}
  </ScrollView>
}
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: '#f9fafb' }, content: { padding: 16, gap: 14 }, title: { fontSize: 15, fontWeight: '700', flexShrink: 1 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', padding: 16, gap: 12 }, button: { backgroundColor: '#16a34a', padding: 10, borderRadius: 8 }, white: { color: '#fff', fontWeight: '600' }, muted: { color: '#9ca3af', fontSize: 13 }, error: { color: '#dc2626' } })
