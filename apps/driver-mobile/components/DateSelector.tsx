import { useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { colors } from '../components'
import { getKstToday } from '../lib/format'

function shift(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

export function DateSelector({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(value.slice(0, 7))
  const [year, monthNumber] = month.split('-').map(Number)
  const offset = new Date(`${month}-01T00:00:00Z`).getUTCDay()
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  function moveMonth(delta: number) {
    setMonth(new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7))
  }
  function choose(date: string) { onChange(date); setOpen(false) }
  return <View style={{ marginVertical: 12 }}>
    <Text style={{ color: colors.muted, marginBottom: 6 }}>조회 날짜</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <DateButton label="‹" accessibilityLabel="이전 날짜" onPress={() => onChange(shift(value, -1))} />
      <View style={{ flex: 1 }}><DateButton label={`${value} ▾`} accessibilityLabel="조회 날짜 달력 열기" onPress={() => { setMonth(value.slice(0, 7)); setOpen(true) }} /></View>
      <DateButton label="›" accessibilityLabel="다음 날짜" onPress={() => onChange(shift(value, 1))} />
      <DateButton label="오늘" onPress={() => onChange(getKstToday())} />
    </View>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: '#0007', justifyContent: 'center', padding: 18 }}>
        <ScrollView style={{ flexGrow: 0, backgroundColor: 'white', borderRadius: 16 }} contentContainerStyle={{ padding: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'center', marginVertical: 12 }}>{year}년 {monthNumber}월</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <DateButton label="«" accessibilityLabel="이전 연도" onPress={() => moveMonth(-12)} />
            <DateButton label="‹" accessibilityLabel="이전 달" onPress={() => moveMonth(-1)} />
            <DateButton label="›" accessibilityLabel="다음 달" onPress={() => moveMonth(1)} />
            <DateButton label="»" accessibilityLabel="다음 연도" onPress={() => moveMonth(12)} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {['일', '월', '화', '수', '목', '금', '토'].map(day => <Text key={day} style={{ width: '14.2857%', textAlign: 'center', paddingVertical: 12, color: colors.muted }}>{day}</Text>)}
            {Array.from({ length: offset + days }, (_, i) => {
              const day = i - offset + 1
              const date = `${month}-${String(day).padStart(2, '0')}`
              return <View key={i} style={{ width: '14.2857%' }}>{day > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={date} accessibilityState={{ selected: value === date }} onPress={() => choose(date)} style={{ minHeight: 44, justifyContent: 'center', borderRadius: 8, backgroundColor: value === date ? colors.green : 'white' }}><Text style={{ textAlign: 'center', color: value === date ? 'white' : colors.ink }}>{day}</Text></Pressable> : null}</View>
            })}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
            <DateButton label="오늘" onPress={() => choose(getKstToday())} />
            <DateButton label="닫기" onPress={() => setOpen(false)} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  </View>
}

function DateButton({ label, accessibilityLabel, onPress }: { label: string; accessibilityLabel?: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.soft, borderRadius: 8 }}>
    <Text style={{ color: colors.ink, fontWeight: '800' }}>{label}</Text>
  </Pressable>
}
