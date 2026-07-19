import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Modal, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { supabase } from '@/lib/supabase'
import { waitingSupabase } from '@/lib/waiting-supabase'

const WEB_URL = 'https://order.fruitlife.shop'

type Restaurant = { id: string; name: string }
type Entry = { id: string; name: string; phone: string; party_size: number; status: 'waiting' | 'called' | 'seated' | 'cancelled' | 'no_show'; created_at: string }
type Divider = { id: '__divider__' }

function kstToday() { return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0] }
function shiftDate(value: string, days: number) { const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().split('T')[0] }
function waitingMinutes(value: string) { const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000); return minutes < 1 ? '방금' : `${minutes}분 전` }

export default function WaitingScreen() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [waitingEnabled, setWaitingEnabled] = useState<boolean | null>(null)
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [restaurantPhone, setRestaurantPhone] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [date, setDate] = useState(kstToday())
  const channelRef = useRef<ReturnType<typeof waitingSupabase.channel> | null>(null)

  const loadEntries = useCallback(async (restaurantId: string, targetDate = date) => {
    const start = new Date(`${targetDate}T00:00:00+09:00`).toISOString()
    const next = shiftDate(targetDate, 1)
    const end = new Date(`${next}T00:00:00+09:00`).toISOString()
    const { data } = await waitingSupabase.from('waiting_entries').select('*').eq('restaurant_id', restaurantId).gte('created_at', start).lt('created_at', end).order('created_at', { ascending: true })
    setEntries((data ?? []) as Entry[])
  }, [date])

  const initRestaurant = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: membership } = await supabase.from('memberships').select('organization_id, organizations(name)').eq('user_id', user.id).single()
    const org = Array.isArray(membership?.organizations) ? membership.organizations[0] : membership?.organizations
    if (!membership?.organization_id) { setWaitingEnabled(false); return null }
    const { data: rest } = await supabase.from('restaurants').select('id, waiting_enabled').eq('organization_id', membership.organization_id).maybeSingle()
    setWaitingEnabled(rest?.waiting_enabled ?? false)
    if (!rest?.waiting_enabled) return null
    const { data: contact } = await supabase.from('contacts').select('phone').eq('organization_id', membership.organization_id).eq('is_primary', true).maybeSingle()
    if (contact?.phone) setRestaurantPhone(contact.phone)
    const result = { id: rest.id, name: (org as { name?: string } | null)?.name ?? '내 식당' }
    setRestaurant(result)
    return result
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      const rest = await initRestaurant()
      if (rest && active) await loadEntries(rest.id)
      if (active) setLoading(false)
    })()
    return () => { active = false; if (channelRef.current) void waitingSupabase.removeChannel(channelRef.current) }
  }, [initRestaurant, loadEntries])

  useEffect(() => { if (restaurant) void loadEntries(restaurant.id, date) }, [date, loadEntries, restaurant])
  useEffect(() => {
    if (!restaurant) return
    if (channelRef.current) void waitingSupabase.removeChannel(channelRef.current)
    const channel = waitingSupabase.channel(`waiting:${restaurant.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'waiting_entries', filter: `restaurant_id=eq.${restaurant.id}` }, () => void loadEntries(restaurant.id)).subscribe()
    channelRef.current = channel
    return () => { void waitingSupabase.removeChannel(channel) }
  }, [loadEntries, restaurant])

  async function update(id: string, values: Record<string, string>) { await waitingSupabase.from('waiting_entries').update(values).eq('id', id) }
  function handleCall(entry: Entry) {
    Alert.alert('자리 알림', `${entry.name}님 (${entry.party_size}명)에게 알림톡을 발송합니다.`, [{ text: '취소', style: 'cancel' }, { text: '발송', onPress: async () => {
      await update(entry.id, { status: 'called', called_at: new Date().toISOString() })
      try { await fetch(`${WEB_URL}/api/waiting/call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: entry.phone, restaurantName: restaurant?.name ?? '식당', restaurantPhone, customerName: entry.name, partySize: entry.party_size, entryId: entry.id }) }) } catch { /* status update is retained */ }
    } }])
  }

  const activeEntries = entries.filter(e => e.status === 'waiting' || e.status === 'called')
  const doneEntries = entries.filter(e => e.status === 'seated' || e.status === 'cancelled' || e.status === 'no_show')
  const list: (Entry | Divider)[] = [...activeEntries, ...(doneEntries.length ? [{ id: '__divider__' as const }] : []), ...doneEntries]
  const customerUrl = restaurant ? `${WEB_URL}/waiting/${restaurant.id}` : ''

  if (loading) return <View style={s.center}><ActivityIndicator color="#16a34a" size="large" /></View>
  if (!waitingEnabled) return <View style={s.center}><Text style={s.disabledText}>{'웨이팅 기능이 활성화되지 않은 업장입니다.\n관리자에게 문의해주세요.'}</Text></View>

  return <View style={s.container}>
    <View style={s.header}><Text style={s.headerTitle}>{restaurant?.name ?? ''} 웨이팅</Text><TouchableOpacity style={s.qrBtn} onPress={() => setModalOpen(true)}><Text style={s.qrBtnText}>QR 보기</Text></TouchableOpacity></View>
    <View style={s.dateBar}><TouchableOpacity style={s.dateArrow} onPress={() => setDate(shiftDate(date, -1))}><Text style={s.dateArrowText}>←</Text></TouchableOpacity><View style={s.dateLabelWrap}><Text style={s.dateLabel}>{date}</Text>{date === kstToday() && <Text style={s.dateTodayBadge}>오늘</Text>}</View><TouchableOpacity style={s.dateArrow} onPress={() => { if (date < kstToday()) setDate(shiftDate(date, 1)) }}><Text style={[s.dateArrowText, date >= kstToday() && { color: '#d1d5db' }]}>→</Text></TouchableOpacity></View>
    <View style={s.countBar}><Text style={s.countText}>대기 <Text style={s.countNum}>{activeEntries.filter(e => e.status === 'waiting').length}</Text>팀 · 호출 <Text style={s.countNum}>{activeEntries.filter(e => e.status === 'called').length}</Text>팀</Text></View>
    <FlatList data={list} keyExtractor={item => item.id} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { if (!restaurant) return; setRefreshing(true); await loadEntries(restaurant.id); setRefreshing(false) }} tintColor="#16a34a" />} contentContainerStyle={{ paddingBottom: 24 }} ListEmptyComponent={<Text style={s.empty}>현재 대기 없음</Text>} renderItem={({ item }) => {
      if (item.id === '__divider__') return <Text style={s.divider}>— 완료 / 취소 —</Text>
      const entry = item as Entry; const done = ['seated', 'cancelled', 'no_show'].includes(entry.status); const colors = { waiting: '#3b82f6', called: '#f59e0b', seated: '#16a34a', cancelled: '#9ca3af', no_show: '#ef4444' }; const labels = { waiting: '대기중', called: '호출됨', seated: '입장완료', cancelled: '취소', no_show: '노쇼' }
      return <View style={[s.card, done && s.cardDone]}><View style={s.cardTop}><View><Text style={s.name}>{entry.name}</Text><Text style={s.meta}>{entry.party_size}명 · {waitingMinutes(entry.created_at)}</Text></View><View style={[s.badge, { backgroundColor: `${colors[entry.status]}22` }]}><Text style={[s.badgeText, { color: colors[entry.status] }]}>{labels[entry.status]}</Text></View></View>{!done && <View style={s.btnRow}>{entry.status === 'waiting' && <><TouchableOpacity style={s.callBtn} onPress={() => handleCall(entry)}><Text style={s.callBtnText}>자리남</Text></TouchableOpacity><TouchableOpacity style={s.cancelBtn} onPress={() => void update(entry.id, { status: 'cancelled' })}><Text style={s.cancelBtnText}>취소</Text></TouchableOpacity></>}{entry.status === 'called' && <><TouchableOpacity style={s.seatedBtn} onPress={() => void update(entry.id, { status: 'seated', seated_at: new Date().toISOString() })}><Text style={s.seatedBtnText}>입장</Text></TouchableOpacity><TouchableOpacity style={s.cancelBtn} onPress={() => void update(entry.id, { status: 'no_show' })}><Text style={s.cancelBtnText}>노쇼</Text></TouchableOpacity></>}</View>}</View>
    }} />
    <Modal visible={modalOpen} transparent animationType="fade"><View style={s.modalOverlay}><View style={s.modalBox}><Text style={s.modalTitle}>손님용 웨이팅 URL</Text><Text style={s.modalUrl}>{customerUrl}</Text><Text style={s.modalNote}>이 URL을 QR 코드로 만들어 식당 입구에 부착하세요.</Text><TouchableOpacity style={s.modalClose} onPress={() => setModalOpen(false)}><Text style={s.modalCloseText}>닫기</Text></TouchableOpacity></View></View></Modal>
  </View>
}

const s = StyleSheet.create({ container: { flex: 1, backgroundColor: '#f9fafb' }, center: { flex: 1, justifyContent: 'center', alignItems: 'center' }, disabledText: { fontSize: 15, color: '#9ca3af', textAlign: 'center', lineHeight: 26, paddingHorizontal: 32 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }, headerTitle: { fontSize: 16, fontWeight: '700', color: '#111' }, qrBtn: { backgroundColor: '#16a34a', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 }, qrBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' }, dateBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }, dateArrow: { padding: 8 }, dateArrowText: { fontSize: 18, color: '#374151' }, dateLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 }, dateLabel: { fontSize: 15, fontWeight: '600', color: '#111' }, dateTodayBadge: { fontSize: 11, color: '#16a34a', fontWeight: '700', backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }, countBar: { backgroundColor: '#f0fdf4', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#dcfce7' }, countText: { fontSize: 14, color: '#374151' }, countNum: { fontWeight: '700', color: '#16a34a' }, empty: { textAlign: 'center', color: '#9ca3af', marginTop: 60, fontSize: 14 }, divider: { textAlign: 'center', color: '#9ca3af', fontSize: 12, marginVertical: 12 }, card: { backgroundColor: '#fff', marginHorizontal: 12, marginTop: 8, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e5e7eb' }, cardDone: { opacity: 0.5 }, cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, name: { fontSize: 16, fontWeight: '700', color: '#111' }, meta: { fontSize: 13, color: '#6b7280', marginTop: 2 }, badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }, badgeText: { fontSize: 12, fontWeight: '700' }, btnRow: { flexDirection: 'row', gap: 8, marginTop: 12 }, callBtn: { flex: 1, backgroundColor: '#16a34a', borderRadius: 8, paddingVertical: 10, alignItems: 'center' }, callBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' }, seatedBtn: { flex: 1, backgroundColor: '#3b82f6', borderRadius: 8, paddingVertical: 10, alignItems: 'center' }, seatedBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' }, cancelBtn: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 8, paddingVertical: 10, alignItems: 'center' }, cancelBtnText: { color: '#374151', fontSize: 14, fontWeight: '600' }, modalOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center' }, modalBox: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '85%' }, modalTitle: { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 12 }, modalUrl: { fontSize: 13, color: '#374151', backgroundColor: '#f3f4f6', borderRadius: 8, padding: 12, marginBottom: 8 }, modalNote: { fontSize: 13, color: '#6b7280', marginBottom: 16 }, modalClose: { backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }, modalCloseText: { color: '#fff', fontSize: 15, fontWeight: '700' } })
