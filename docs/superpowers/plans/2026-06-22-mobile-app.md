# FruitLife 모바일 앱 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 `apps/mobile/` 코드를 기반으로 회원용 iOS/Android 앱을 완성한다. 발주·정산·공지·문의 기능을 기존 Supabase에 연결하고, 웨이팅 시스템(새 Supabase)을 신규 탭으로 추가한다.

**Architecture:** 기존 Expo SDK 54 + Expo Router v6 프로젝트를 활용한다. Supabase 클라이언트 2개(기존 DB / 웨이팅 전용 DB)를 사용하며, 웨이팅 알림톡은 기존 Next.js API 라우트를 신규 추가해 Solapi로 발송한다.

**Tech Stack:** Expo SDK 54, Expo Router v6, React Native 0.81, TypeScript, Supabase JS SDK, Solapi

## Global Constraints

- 앱 코드 경로: `apps/mobile/`
- 기존 작동 코드는 수정 최소화 — 발주(`order.tsx`), 정산(`settlement.tsx`), 프로필(`profile.tsx`)은 로직 변경 금지
- 기존 Supabase 프로젝트 ID: `bkfkaugevqvbibjaasbj`
- 기존 Supabase anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrZmthdWdldnF2YmliamFhc2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NzIxNDgsImV4cCI6MjA4NzI0ODE0OH0.9btVcor4L0J8EPmT0IRIlGnl-UTC7w2AKf73-IXcoj8`
- 발주 문자는 새벽 2:30 자동 발송만 허용 — auto-dispatch 코드 건드리지 말 것
- 새 파일/라우트로 기능 추가, 기존 파일 최소 수정 원칙

---

## 파일 구조

### 수정 파일
- `apps/mobile/lib/supabase.ts` — 잘못된 Supabase URL/key 수정
- `apps/mobile/app/(tabs)/_layout.tsx` — 탭 재구성 (내 정보 제거, 웨이팅 추가, 헤더 프로필 아이콘)
- `apps/mobile/app/(tabs)/index.tsx` — 홈 카드 추가 (발주 현황, 미수금, 납품 단가, 수급 예측)

### 신규 파일 (앱)
- `apps/mobile/lib/supabase-waiting.ts` — 웨이팅 전용 Supabase 클라이언트
- `apps/mobile/app/(tabs)/waiting.tsx` — 웨이팅 탭 전체

### 신규 파일 (웹)
- `apps/web/app/api/waiting/call/route.ts` — 자리남 알림톡 발송 API
- `apps/web/app/waiting/[restaurantId]/page.tsx` — 손님 QR 웹 페이지

---

## Task 1: Supabase URL 버그 수정

**Files:**
- Modify: `apps/mobile/lib/supabase.ts`

**Why:** 현재 `nvpaggacvbotgqyxfdof` (잘못된 프로젝트)에 연결되어 있어 모든 기능이 실제 데이터와 연동되지 않는다.

- [ ] **Step 1: supabase.ts 수정**

`apps/mobile/lib/supabase.ts`를 아래로 교체:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://bkfkaugevqvbibjaasbj.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrZmthdWdldnF2YmliamFhc2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NzIxNDgsImV4cCI6MjA4NzI0ODE0OH0.9btVcor4L0J8EPmT0IRIlGnl-UTC7w2AKf73-IXcoj8'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```

- [ ] **Step 2: 앱 실행 후 로그인 테스트**

```bash
cd apps/mobile
npx expo start
```

Expo Go 앱에서 QR 스캔 → 로그인 화면 → 실제 계정으로 로그인 → 홈 화면에 데이터 표시 확인

- [ ] **Step 3: 커밋**

```bash
git add apps/mobile/lib/supabase.ts
git commit -m "fix: 모바일 앱 Supabase 프로젝트 URL 수정 (nvpaggac → bkfkaugev)"
```

---

## Task 2: 탭 구조 재구성

**Files:**
- Modify: `apps/mobile/app/(tabs)/_layout.tsx`
- Create: `apps/mobile/app/(tabs)/waiting.tsx` (플레이스홀더)

**Changes:**
- `profile` 탭 제거 → 홈 헤더 우측 아이콘으로 이동
- `notices` 탭 이름 변경: "공지사항" → "공지·문의"
- `waiting` 탭 신규 추가

- [ ] **Step 1: waiting.tsx 플레이스홀더 생성**

`apps/mobile/app/(tabs)/waiting.tsx`:

```typescript
import { StyleSheet, Text, View } from 'react-native'

export default function WaitingScreen() {
  return (
    <View style={s.container}>
      <Text style={s.text}>웨이팅 시스템 준비 중</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
  text: { fontSize: 16, color: '#9ca3af' },
})
```

- [ ] **Step 2: _layout.tsx 재구성**

`apps/mobile/app/(tabs)/_layout.tsx` 전체 교체:

```typescript
import { Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, Tabs } from 'expo-router'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#16a34a',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { borderTopColor: '#e5e7eb', height: 60, paddingBottom: 8 },
        headerStyle: { backgroundColor: '#fff' },
        headerTitleStyle: { fontWeight: '600', fontSize: 16 },
        headerTintColor: '#111',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarLabel: '홈',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
          headerRight: () => (
            <Pressable onPress={() => router.push('/profile')} style={{ marginRight: 16 }}>
              <Ionicons name="person-circle-outline" size={26} color="#374151" />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="order"
        options={{
          title: '발주',
          tabBarLabel: '발주',
          tabBarIcon: ({ color, size }) => <Ionicons name="clipboard-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settlement"
        options={{
          title: '정산',
          tabBarLabel: '정산',
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="waiting"
        options={{
          title: '웨이팅',
          tabBarLabel: '웨이팅',
          tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notices"
        options={{
          title: '공지·문의',
          tabBarLabel: '공지·문의',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  )
}
```

- [ ] **Step 3: profile 화면을 탭 밖으로 이동**

`apps/mobile/app/(tabs)/profile.tsx` 파일을 `apps/mobile/app/profile.tsx`로 이동:

```bash
mv apps/mobile/app/\(tabs\)/profile.tsx apps/mobile/app/profile.tsx
```

`apps/mobile/app/profile.tsx` 상단 router.replace('/login') 경로는 그대로 유지.

- [ ] **Step 4: @expo/vector-icons 설치 확인**

```bash
cd apps/mobile && npx expo install @expo/vector-icons
```

- [ ] **Step 5: 앱 실행 후 탭 확인**

Expo Go에서 하단 탭 5개 확인: 홈 / 발주 / 정산 / 웨이팅 / 공지·문의  
홈 헤더 우측 사람 아이콘 → 프로필 화면 이동 확인

- [ ] **Step 6: 커밋**

```bash
git add apps/mobile/app/\(tabs\)/_layout.tsx apps/mobile/app/\(tabs\)/waiting.tsx apps/mobile/app/profile.tsx
git commit -m "feat: 모바일 앱 탭 구조 재구성 (웨이팅 탭 추가, 프로필 헤더 이동)"
```

---

## Task 3: 홈 화면 재구성

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx`

기존 홈에 3개 카드 추가: 오늘 발주 현황, 미수금 요약, 현재 납품 단가.  
기존 주간 발주 분석 + AI 어드바이스 + 공지 미리보기는 유지.  
문의 미리보기는 공지·문의 탭으로 이동했으므로 제거.

- [ ] **Step 1: index.tsx 전체 교체**

`apps/mobile/app/(tabs)/index.tsx`:

```typescript
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

import { router } from 'expo-router'

import { supabase } from '@/lib/supabase'

interface Notice { id: string; title: string; created_at: string }
interface WeeklyItem { product_name: string; total_qty: number; unit: string; total_cost: number }
interface PriceItem { product_name: string; unit: string; price: number }

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [restaurantId, setRestaurantId] = useState<string | null>(null)

  // 오늘 발주 현황
  const [todaySubmitted, setTodaySubmitted] = useState(false)
  const [todayItemCount, setTodayItemCount] = useState(0)

  // 미수금
  const [outstanding, setOutstanding] = useState(0)

  // 납품 단가
  const [priceItems, setPriceItems] = useState<PriceItem[]>([])

  // 주간 발주 분석
  const [weeklyItems, setWeeklyItems] = useState<WeeklyItem[]>([])
  const [weeklyTotal, setWeeklyTotal] = useState(0)

  // AI 어드바이스
  const [insight, setInsight] = useState<string | null>(null)

  // 공지
  const [notices, setNotices] = useState<Notice[]>([])

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: membership } = await supabase
      .from('memberships').select('organizations(id)').eq('user_id', user.id).single()
    const oid = (membership?.organizations as { id: string } | null)?.id
    if (!oid) return

    const { data: rest } = await supabase
      .from('restaurants').select('id').eq('organization_id', oid).maybeSingle()
    const rid = rest?.id ?? null
    setRestaurantId(rid)

    const today = new Date().toISOString().split('T')[0]

    if (rid) {
      // 오늘 발주 현황
      const { data: todayBatch } = await supabase
        .from('order_batches').select('id, status')
        .eq('restaurant_id', rid).eq('business_date', today).maybeSingle()
      if (todayBatch) {
        setTodaySubmitted(todayBatch.status !== 'open')
        const { data: todayOrder } = await supabase
          .from('orders').select('id').eq('batch_id', todayBatch.id).maybeSingle()
        if (todayOrder) {
          const { count } = await supabase
            .from('order_items').select('id', { count: 'exact', head: true })
            .eq('order_id', todayOrder.id)
          setTodayItemCount(count ?? 0)
        }
      }

      // 미수금
      const { data: recvs } = await supabase
        .from('receivables').select('balance')
        .eq('restaurant_id', rid).in('status', ['unpaid', 'partial', 'overdue'])
      setOutstanding((recvs ?? []).reduce((s, r) => s + Number(r.balance), 0))

      // 납품 단가 (restaurant_products → products + price_snapshots)
      const { data: rp } = await supabase
        .from('restaurant_products')
        .select('products(id, standard_name, default_unit)')
        .eq('restaurant_id', rid)
        .order('display_order')
      const productIds = (rp ?? []).map(r => {
        const p = Array.isArray(r.products) ? r.products[0] : r.products
        return (p as { id: string } | null)?.id
      }).filter(Boolean) as string[]

      if (productIds.length > 0) {
        const { data: snapshots } = await supabase
          .from('price_snapshots')
          .select('supplier_product_id, sale_price')
          .in('supplier_product_id', productIds)
          .lte('effective_from', today)
          .order('effective_from', { ascending: false })
        
        const latestPriceMap = new Map<string, number>()
        for (const s of snapshots ?? []) {
          if (!latestPriceMap.has(s.supplier_product_id)) {
            latestPriceMap.set(s.supplier_product_id, Number(s.sale_price))
          }
        }

        const prices: PriceItem[] = (rp ?? []).map(r => {
          const p = (Array.isArray(r.products) ? r.products[0] : r.products) as { id: string; standard_name: string; default_unit: string } | null
          if (!p) return null
          return {
            product_name: p.standard_name,
            unit: p.default_unit,
            price: latestPriceMap.get(p.id) ?? 0,
          }
        }).filter(Boolean) as PriceItem[]
        setPriceItems(prices)
      }

      // 주간 발주 분석
      const now = new Date()
      const dow = now.getDay()
      const monday = new Date(now)
      monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
      const weekStart = monday.toISOString().split('T')[0]

      const { data: batches } = await supabase
        .from('order_batches')
        .select('orders(order_items(qty, unit, unit_price_snapshot, products(standard_name)))')
        .eq('restaurant_id', rid)
        .gte('business_date', weekStart)

      const map: Record<string, WeeklyItem> = {}
      for (const batch of batches ?? []) {
        const orders = (batch.orders ?? []) as { order_items: { qty: number; unit: string; unit_price_snapshot: number; products: { standard_name: string } | null }[] }[]
        for (const order of orders) {
          for (const it of order.order_items ?? []) {
            const name = it.products?.standard_name ?? '알 수 없음'
            if (!map[name]) map[name] = { product_name: name, total_qty: 0, unit: it.unit, total_cost: 0 }
            map[name].total_qty += Number(it.qty)
            map[name].total_cost += Number(it.qty) * Number(it.unit_price_snapshot)
          }
        }
      }
      const list = Object.values(map)
      setWeeklyItems(list)
      setWeeklyTotal(list.reduce((s, i) => s + i.total_cost, 0))

      // AI 어드바이스
      const { data: insightRow } = await supabase
        .from('weekly_insights').select('insight_text')
        .eq('restaurant_id', rid).gte('week_start', weekStart).maybeSingle()
      setInsight(insightRow?.insight_text ?? null)
    }

    // 공지
    const { data: noticeData } = await supabase
      .from('notices').select('id, title, created_at').order('created_at', { ascending: false }).limit(3)
    setNotices(noticeData ?? [])
  }

  useEffect(() => { loadAll().finally(() => setLoading(false)) }, [])

  async function onRefresh() {
    setRefreshing(true)
    await loadAll()
    setRefreshing(false)
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#16a34a" size="large" /></View>

  const today = new Date()
  const dow = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))
  const saturday = new Date(monday)
  saturday.setDate(monday.getDate() + 5)
  const dateRange = `${monday.getMonth() + 1}/${monday.getDate()}(월) ~ ${saturday.getMonth() + 1}/${saturday.getDate()}(토)`

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" />}>

      {/* 오늘 발주 현황 */}
      <TouchableOpacity style={s.card} onPress={() => router.push('/(tabs)/order')}>
        <Text style={s.cardTitle}>📋 오늘 발주 현황</Text>
        <View style={s.row}>
          <View style={[s.statusBadge, todaySubmitted ? s.badgeGreen : s.badgeYellow]}>
            <Text style={[s.statusText, todaySubmitted ? s.textGreen : s.textYellow]}>
              {todaySubmitted ? '제출 완료' : '미제출'}
            </Text>
          </View>
          {todayItemCount > 0 && <Text style={s.itemCount}>품목 {todayItemCount}개</Text>}
        </View>
      </TouchableOpacity>

      {/* 미수금 요약 */}
      <TouchableOpacity style={s.card} onPress={() => router.push('/(tabs)/settlement')}>
        <Text style={s.cardTitle}>💰 현재 미수금</Text>
        <Text style={[s.bigAmount, outstanding > 0 ? s.danger : s.safe]}>
          {outstanding.toLocaleString()}원
        </Text>
        {outstanding === 0 && <Text style={s.safeNote}>✅ 미수금 없음</Text>}
      </TouchableOpacity>

      {/* 현재 납품 단가 */}
      {priceItems.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>🏷 현재 납품 단가</Text>
          {priceItems.map((item, i) => (
            <View key={i} style={s.priceRow}>
              <Text style={s.priceName}>{item.product_name}</Text>
              <Text style={s.priceVal}>{item.price > 0 ? `${item.price.toLocaleString()}원/${item.unit}` : '-'}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 주간 발주 분석 */}
      <View style={s.card}>
        <Text style={s.cardTitle}>📊 이번 주 납품 분석</Text>
        <Text style={s.dateRange}>{dateRange}</Text>
        {weeklyItems.length === 0 ? (
          <Text style={s.empty}>이번 주 발주 내역이 없습니다.</Text>
        ) : (
          <>
            {weeklyItems.map((item, i) => (
              <View key={i} style={s.weekRow}>
                <Text style={s.weekName}>{item.product_name}</Text>
                <Text style={s.weekQty}>{item.total_qty}{item.unit}</Text>
                <Text style={s.weekCost}>{item.total_cost.toLocaleString()}원</Text>
              </View>
            ))}
            <View style={[s.weekRow, s.totalRow]}>
              <Text style={s.totalLabel}>주간 총 비용</Text>
              <Text style={s.totalAmount}>{weeklyTotal.toLocaleString()}원</Text>
            </View>
          </>
        )}
      </View>

      {/* 수급위험 예측 · AI 어드바이스 */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>✨ 수급위험 예측 · 구매 어드바이스</Text>
          <Text style={s.badge}>AI 분석</Text>
        </View>
        {insight ? (
          <Text style={s.insightText}>{insight}</Text>
        ) : (
          <Text style={s.empty}>AI 분석 데이터를 불러오는 중입니다.</Text>
        )}
      </View>

      {/* 공지 미리보기 */}
      <View style={[s.card, { marginBottom: 24 }]}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>📢 공지사항</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/notices')}>
            <Text style={s.more}>전체보기 →</Text>
          </TouchableOpacity>
        </View>
        {notices.length === 0 ? (
          <Text style={s.empty}>공지 없음</Text>
        ) : (
          notices.map((n) => (
            <TouchableOpacity key={n.id} style={s.listItem} onPress={() => router.push(`/notice/${n.id}`)}>
              <Text style={s.listTitle} numberOfLines={1}>{n.title}</Text>
              <Text style={s.listDate}>{new Date(n.created_at).toLocaleDateString('ko-KR')}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', margin: 12, marginBottom: 0, borderRadius: 12, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 10 },
  badge: { fontSize: 11, color: '#6b7280', backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  badgeGreen: { backgroundColor: '#dcfce7' },
  badgeYellow: { backgroundColor: '#fef9c3' },
  statusText: { fontSize: 13, fontWeight: '700' },
  textGreen: { color: '#16a34a' },
  textYellow: { color: '#92400e' },
  itemCount: { fontSize: 13, color: '#6b7280' },
  bigAmount: { fontSize: 28, fontWeight: '800', marginTop: 4 },
  danger: { color: '#dc2626' },
  safe: { color: '#111' },
  safeNote: { fontSize: 13, color: '#16a34a', marginTop: 4 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  priceName: { fontSize: 14, color: '#374151' },
  priceVal: { fontSize: 14, color: '#111', fontWeight: '600' },
  dateRange: { fontSize: 12, color: '#9ca3af', marginBottom: 8, marginTop: -4 },
  weekRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  weekName: { flex: 1, fontSize: 14, color: '#374151' },
  weekQty: { fontSize: 13, color: '#6b7280', width: 60, textAlign: 'right' },
  weekCost: { fontSize: 13, color: '#111', width: 80, textAlign: 'right', fontWeight: '600' },
  totalRow: { borderBottomWidth: 0, marginTop: 4 },
  totalLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111' },
  totalAmount: { fontSize: 15, fontWeight: '700', color: '#16a34a' },
  insightText: { fontSize: 14, color: '#374151', lineHeight: 22 },
  empty: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 12 },
  more: { fontSize: 13, color: '#16a34a', fontWeight: '600' },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  listTitle: { flex: 1, fontSize: 14, color: '#374151' },
  listDate: { fontSize: 12, color: '#9ca3af', marginLeft: 8 },
})
```

- [ ] **Step 2: 앱 실행 후 홈 화면 확인**

Expo Go에서 홈 탭 확인:
- 오늘 발주 현황 카드 (제출 여부)
- 미수금 금액 표시
- 납품 단가 리스트 (price_snapshots 조회 확인)
- 주간 발주 분석
- AI 어드바이스
- 공지 미리보기

납품 단가가 안 보이면: Supabase에서 `price_snapshots` 테이블 구조 확인 후 쿼리 조정 필요.

- [ ] **Step 3: 커밋**

```bash
git add apps/mobile/app/\(tabs\)/index.tsx
git commit -m "feat: 홈 화면 재구성 (발주 현황, 미수금, 납품 단가 카드 추가)"
```

---

## Task 4: 웨이팅 Supabase 프로젝트 설정

**Files:**
- Create: `apps/mobile/lib/supabase-waiting.ts`

**Manual Step:** Supabase 대시보드에서 새 프로젝트 생성 후 URL/anon key를 받아야 한다.

- [ ] **Step 1: 새 Supabase 프로젝트 생성 (수동)**

[supabase.com/dashboard](https://supabase.com/dashboard) → New Project  
- 이름: `fruitlife-waiting`
- 비밀번호 저장 후 URL과 anon key 메모

- [ ] **Step 2: 웨이팅 DB 스키마 생성**

새 Supabase 프로젝트 → SQL Editor에서 실행:

```sql
-- 식당 테이블
CREATE TABLE restaurants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  owner_user_id TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 대기 신청 테이블
CREATE TABLE waiting_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  party_size    INT NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting', 'called', 'seated', 'cancelled', 'no_show')),
  called_at     TIMESTAMPTZ,
  seated_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE waiting_entries;

-- RLS 설정
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiting_entries ENABLE ROW LEVEL SECURITY;

-- restaurants: 인증된 유저는 자기 식당만 조회/수정
CREATE POLICY "owner_access" ON restaurants
  USING (owner_user_id = auth.uid()::text);

-- waiting_entries: 식당 소유자만 읽기/수정 가능
CREATE POLICY "owner_read" ON waiting_entries
  FOR SELECT USING (
    restaurant_id IN (SELECT id FROM restaurants WHERE owner_user_id = auth.uid()::text)
  );
CREATE POLICY "owner_update" ON waiting_entries
  FOR UPDATE USING (
    restaurant_id IN (SELECT id FROM restaurants WHERE owner_user_id = auth.uid()::text)
  );

-- QR 페이지에서 손님 신청용 (anon 허용)
CREATE POLICY "anon_insert" ON waiting_entries
  FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_read_restaurant" ON restaurants
  FOR SELECT USING (true);
```

- [ ] **Step 3: supabase-waiting.ts 생성**

`apps/mobile/lib/supabase-waiting.ts`:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

// 새 Supabase 프로젝트 (웨이팅 전용) — Step 1에서 생성한 값으로 교체
const WAITING_SUPABASE_URL = 'https://[새프로젝트ID].supabase.co'
const WAITING_SUPABASE_ANON_KEY = '[새프로젝트anon키]'

export const waitingSupabase = createClient(WAITING_SUPABASE_URL, WAITING_SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```

- [ ] **Step 4: 커밋**

```bash
git add apps/mobile/lib/supabase-waiting.ts
git commit -m "feat: 웨이팅 전용 Supabase 클라이언트 추가"
```

---

## Task 5: 웨이팅 탭 구현

**Files:**
- Modify: `apps/mobile/app/(tabs)/waiting.tsx`

**Interfaces:**
- Consumes: `waitingSupabase` from `@/lib/supabase-waiting`
- Consumes: `supabase` from `@/lib/supabase` (기존 유저 auth)

- [ ] **Step 1: waiting.tsx 전체 구현**

`apps/mobile/app/(tabs)/waiting.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

import { supabase } from '@/lib/supabase'
import { waitingSupabase } from '@/lib/supabase-waiting'

interface WaitingEntry {
  id: string
  name: string
  phone: string
  party_size: number
  status: 'waiting' | 'called' | 'seated' | 'cancelled' | 'no_show'
  called_at: string | null
  created_at: string
}

interface Restaurant {
  id: string
  name: string
}

const API_BASE = 'https://order.fruitlife.shop'

export default function WaitingScreen() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [entries, setEntries] = useState<WaitingEntry[]>([])
  const [qrVisible, setQrVisible] = useState(false)
  const subscriptionRef = useRef<ReturnType<typeof waitingSupabase.channel> | null>(null)

  async function initRestaurant() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // 웨이팅 DB에서 내 식당 조회 또는 생성
    const { data: existing } = await waitingSupabase
      .from('restaurants').select('id, name')
      .eq('owner_user_id', user.id).maybeSingle()

    if (existing) {
      setRestaurant(existing)
      return existing
    }

    // 기존 Supabase에서 식당 이름 가져오기
    const { data: membership } = await supabase
      .from('memberships').select('organizations(name)').eq('user_id', user.id).single()
    const orgName = (membership?.organizations as { name: string } | null)?.name ?? '내 식당'

    const { data: newRest } = await waitingSupabase
      .from('restaurants').insert({ name: orgName, owner_user_id: user.id }).select('id, name').single()
    if (newRest) setRestaurant(newRest)
    return newRest
  }

  async function loadEntries(restaurantId: string) {
    const { data } = await waitingSupabase
      .from('waiting_entries').select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: true })
    setEntries((data ?? []) as WaitingEntry[])
  }

  function subscribeRealtime(restaurantId: string) {
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe()
    }
    const channel = waitingSupabase
      .channel(`waiting:${restaurantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'waiting_entries',
        filter: `restaurant_id=eq.${restaurantId}`,
      }, () => { loadEntries(restaurantId) })
      .subscribe()
    subscriptionRef.current = channel
  }

  useEffect(() => {
    async function init() {
      const rest = await initRestaurant()
      if (rest) {
        await loadEntries(rest.id)
        subscribeRealtime(rest.id)
      }
      setLoading(false)
    }
    init()
    return () => { subscriptionRef.current?.unsubscribe() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onRefresh() {
    if (!restaurant) return
    setRefreshing(true)
    await loadEntries(restaurant.id)
    setRefreshing(false)
  }

  async function handleCall(entry: WaitingEntry) {
    Alert.alert('자리 알림', `${entry.name}님 (${entry.party_size}명)에게 알림톡을 발송합니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '발송', onPress: async () => {
          await waitingSupabase.from('waiting_entries')
            .update({ status: 'called', called_at: new Date().toISOString() })
            .eq('id', entry.id)

          // 알림톡 발송
          try {
            await fetch(`${API_BASE}/api/waiting/call`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phone: entry.phone,
                restaurantName: restaurant?.name ?? '식당',
                entryId: entry.id,
              }),
            })
          } catch {
            // 알림톡 실패해도 상태 변경은 완료
          }
        }
      },
    ])
  }

  async function handleSeated(entryId: string) {
    await waitingSupabase.from('waiting_entries')
      .update({ status: 'seated', seated_at: new Date().toISOString() })
      .eq('id', entryId)
  }

  async function handleNoShow(entryId: string) {
    await waitingSupabase.from('waiting_entries')
      .update({ status: 'no_show' }).eq('id', entryId)
  }

  async function handleCancel(entryId: string) {
    await waitingSupabase.from('waiting_entries')
      .update({ status: 'cancelled' }).eq('id', entryId)
  }

  function waitingMinutes(createdAt: string): string {
    const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
    return diff < 1 ? '방금' : `${diff}분 전`
  }

  const activeEntries = entries.filter(e => e.status === 'waiting' || e.status === 'called')
  const doneEntries = entries.filter(e => e.status === 'seated' || e.status === 'cancelled' || e.status === 'no_show')

  if (loading) return <View style={s.center}><ActivityIndicator color="#16a34a" size="large" /></View>

  const qrUrl = restaurant ? `${API_BASE}/waiting/${restaurant.id}` : ''

  return (
    <View style={s.container}>
      {/* QR 버튼 */}
      <View style={s.header}>
        <Text style={s.headerTitle}>{restaurant?.name ?? ''} 웨이팅</Text>
        <TouchableOpacity style={s.qrBtn} onPress={() => setQrVisible(true)}>
          <Text style={s.qrBtnText}>QR 보기</Text>
        </TouchableOpacity>
      </View>

      {/* 대기 카운트 */}
      <View style={s.countBar}>
        <Text style={s.countText}>
          대기 <Text style={s.countNum}>{activeEntries.filter(e => e.status === 'waiting').length}</Text>팀
          · 호출 <Text style={s.countNum}>{activeEntries.filter(e => e.status === 'called').length}</Text>팀
        </Text>
      </View>

      <FlatList
        data={[...activeEntries, ...(doneEntries.length > 0 ? [{ id: '__divider__' } as WaitingEntry] : []), ...doneEntries]}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" />}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<Text style={s.empty}>현재 대기 없음</Text>}
        renderItem={({ item }) => {
          if (item.id === '__divider__') {
            return <Text style={s.divider}>— 완료 / 취소 —</Text>
          }
          const isDone = item.status === 'seated' || item.status === 'cancelled' || item.status === 'no_show'
          const statusLabel = { waiting: '대기중', called: '호출됨', seated: '입장완료', cancelled: '취소', no_show: '노쇼' }
          const statusColor = { waiting: '#3b82f6', called: '#f59e0b', seated: '#16a34a', cancelled: '#9ca3af', no_show: '#ef4444' }
          return (
            <View style={[s.card, isDone && s.cardDone]}>
              <View style={s.cardTop}>
                <View>
                  <Text style={s.name}>{item.name}</Text>
                  <Text style={s.meta}>{item.party_size}명 · {waitingMinutes(item.created_at)}</Text>
                </View>
                <View style={[s.badge, { backgroundColor: statusColor[item.status] + '22' }]}>
                  <Text style={[s.badgeText, { color: statusColor[item.status] }]}>{statusLabel[item.status]}</Text>
                </View>
              </View>
              {!isDone && (
                <View style={s.btnRow}>
                  {item.status === 'waiting' && (
                    <>
                      <TouchableOpacity style={s.callBtn} onPress={() => handleCall(item)}>
                        <Text style={s.callBtnText}>자리남</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.cancelBtn} onPress={() => handleCancel(item.id)}>
                        <Text style={s.cancelBtnText}>취소</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {item.status === 'called' && (
                    <>
                      <TouchableOpacity style={s.seatedBtn} onPress={() => handleSeated(item.id)}>
                        <Text style={s.seatedBtnText}>입장</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.cancelBtn} onPress={() => handleNoShow(item.id)}>
                        <Text style={s.cancelBtnText}>노쇼</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            </View>
          )
        }}
      />

      {/* QR 모달 */}
      <Modal visible={qrVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>손님용 웨이팅 URL</Text>
            <Text style={s.modalUrl}>{qrUrl}</Text>
            <Text style={s.modalNote}>이 URL을 QR 코드로 만들어 식당 입구에 부착하세요.</Text>
            <TouchableOpacity style={s.modalClose} onPress={() => setQrVisible(false)}>
              <Text style={s.modalCloseText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  qrBtn: { backgroundColor: '#16a34a', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  qrBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  countBar: { backgroundColor: '#f0fdf4', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#dcfce7' },
  countText: { fontSize: 14, color: '#374151' },
  countNum: { fontWeight: '700', color: '#16a34a' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 60, fontSize: 14 },
  divider: { textAlign: 'center', color: '#9ca3af', fontSize: 12, marginVertical: 12 },
  card: { backgroundColor: '#fff', marginHorizontal: 12, marginTop: 8, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e5e7eb' },
  cardDone: { opacity: 0.5 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  name: { fontSize: 16, fontWeight: '700', color: '#111' },
  meta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  callBtn: { flex: 1, backgroundColor: '#16a34a', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  callBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  seatedBtn: { flex: 1, backgroundColor: '#3b82f6', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  seatedBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  cancelBtnText: { color: '#374151', fontSize: 14, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '85%' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 12 },
  modalUrl: { fontSize: 13, color: '#374151', backgroundColor: '#f3f4f6', borderRadius: 8, padding: 12, marginBottom: 8 },
  modalNote: { fontSize: 13, color: '#6b7280', marginBottom: 16 },
  modalClose: { backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  modalCloseText: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
```

- [ ] **Step 2: 앱 실행 후 웨이팅 탭 확인**

Expo Go → 웨이팅 탭:
- 식당 이름 표시 확인
- "QR 보기" 버튼 → URL 모달 확인
- Supabase 대시보드에서 수동으로 waiting_entries 행 추가 → 실시간으로 목록에 나타나는지 확인

- [ ] **Step 3: 커밋**

```bash
git add apps/mobile/app/\(tabs\)/waiting.tsx
git commit -m "feat: 웨이팅 탭 구현 (실시간 대기 목록, 자리남/입장/노쇼 버튼)"
```

---

## Task 6: 알림톡 발송 API (Next.js)

**Files:**
- Create: `apps/web/app/api/waiting/call/route.ts`

기존 발주 알림톡(`/api/admin/orders/auto-dispatch`)과 동일한 Solapi 패턴 사용.

- [ ] **Step 1: route.ts 생성**

`apps/web/app/api/waiting/call/route.ts`:

```typescript
export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { sendSms } from '@/lib/messaging/kakao'

export async function POST(req: Request) {
  try {
    const { phone, restaurantName, entryId } = await req.json() as {
      phone: string
      restaurantName: string
      entryId: string
    }

    if (!phone || !restaurantName) {
      return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 })
    }

    const text = `[${restaurantName}] 웨이팅\n\n자리가 났습니다!\n5분 내 입장해 주세요.\n\n입장하지 않으시면 대기가 취소됩니다.`

    const result = await sendSms(phone, text)

    return NextResponse.json({
      success: result.success,
      entryId,
      ...(result.error && { error: result.error }),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '오류 발생' }, { status: 500 })
  }
}
```

- [ ] **Step 2: 로컬 테스트**

```bash
cd apps/web && npx next dev
```

별도 터미널에서:
```bash
curl -X POST http://localhost:3000/api/waiting/call \
  -H "Content-Type: application/json" \
  -d '{"phone":"010-1234-5678","restaurantName":"테스트 식당","entryId":"test-id"}'
```

Expected: `{"success":true,"entryId":"test-id"}` 또는 SMS 실제 발송 확인

- [ ] **Step 3: 커밋 + 배포**

```bash
git add apps/web/app/api/waiting/call/route.ts
git commit -m "feat: 웨이팅 자리남 알림톡 발송 API 추가"
git push
```

Cloudflare Pages 자동 배포 완료 후 앱에서 자리남 버튼 테스트.

---

## Task 7: QR 웹 페이지 (손님용)

**Files:**
- Create: `apps/web/app/waiting/[restaurantId]/page.tsx`

손님이 QR 스캔 후 보는 화면. 기존 Next.js 코드 건드리지 않는 신규 파일.

- [ ] **Step 1: page.tsx 생성**

`apps/web/app/waiting/[restaurantId]/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// 웨이팅 전용 Supabase (Task 4에서 생성한 값으로 교체)
const waitingSupabase = createClient(
  'https://[웨이팅프로젝트ID].supabase.co',
  '[웨이팅프로젝트ANONKEY]'
)

export default function WaitingPage({ params }: { params: { restaurantId: string } }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [partySize, setPartySize] = useState('2')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !phone.trim()) {
      setError('이름과 전화번호를 입력해주세요.')
      return
    }
    setLoading(true)
    setError('')

    const { error: insertError } = await waitingSupabase.from('waiting_entries').insert({
      restaurant_id: params.restaurantId,
      name: name.trim(),
      phone: phone.trim(),
      party_size: Number(partySize) || 1,
    })

    setLoading(false)
    if (insertError) {
      setError('신청 중 오류가 발생했습니다. 다시 시도해주세요.')
    } else {
      setDone(true)
    }
  }

  if (done) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 16 }}>✅</div>
          <h2 style={styles.title}>대기 접수 완료</h2>
          <p style={styles.desc}>
            자리가 나면 카카오톡으로 연락드립니다.<br />
            잠시만 기다려 주세요.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.logo}>🍊 FruitLife</h1>
        <h2 style={styles.title}>웨이팅 신청</h2>
        <form onSubmit={handleSubmit}>
          <div style={styles.field}>
            <label style={styles.label}>이름</label>
            <input
              style={styles.input}
              type="text"
              placeholder="이름을 입력하세요"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>전화번호</label>
            <input
              style={styles.input}
              type="tel"
              placeholder="010-0000-0000"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>인원수</label>
            <select
              style={styles.input}
              value={partySize}
              onChange={e => setPartySize(e.target.value)}
            >
              {[1,2,3,4,5,6,7,8].map(n => (
                <option key={n} value={n}>{n}명</option>
              ))}
            </select>
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? '신청 중...' : '웨이팅 신청하기'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 32, width: '100%', maxWidth: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' },
  logo: { textAlign: 'center', fontSize: 24, fontWeight: 700, color: '#16a34a', marginBottom: 4 },
  title: { textAlign: 'center', fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 24 },
  desc: { textAlign: 'center', fontSize: 16, color: '#374151', lineHeight: 1.6 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 },
  input: { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 16, color: '#111', backgroundColor: '#f9fafb', boxSizing: 'border-box' },
  error: { color: '#dc2626', fontSize: 13, marginBottom: 12 },
  btn: { width: '100%', padding: '14px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer' },
}
```

- [ ] **Step 2: 로컬 테스트**

```bash
cd apps/web && npx next dev
```

브라우저에서 `http://localhost:3000/waiting/[실제restaurant-id]` 접속  
이름/전화번호/인원수 입력 → 신청 → "대기 접수 완료" 화면 확인  
Supabase 대시보드 → waiting_entries 테이블에 행 추가 확인

- [ ] **Step 3: 커밋 + 배포**

```bash
git add apps/web/app/waiting/
git commit -m "feat: 손님용 웨이팅 신청 QR 웹 페이지 추가"
git push
```

Cloudflare Pages 배포 완료 후 실제 URL로 테스트.

---

## Task 8: 전체 통합 테스트

- [ ] **Step 1: 웨이팅 엔드-투-엔드 테스트**

1. 앱 로그인 → 웨이팅 탭 → "QR 보기" → URL 확인
2. 해당 URL을 브라우저에서 열기 → 이름/연락처/인원수 입력 → 신청
3. 앱 웨이팅 탭에 실시간으로 대기자 카드 나타나는지 확인
4. "자리남" 버튼 클릭 → 알림톡 발송 확인 (실제 번호로 테스트)
5. "입장" 버튼 → 완료 섹션으로 이동 확인

- [ ] **Step 2: 기존 기능 회귀 테스트**

- 발주 탭: 오늘 발주 입력 → 제출 → 상태 변경 확인
- 정산 탭: 미수금 금액 표시 확인
- 공지·문의 탭: 공지 목록 / 문의 작성 확인

- [ ] **Step 3: 최종 커밋**

```bash
git add .
git commit -m "feat: FruitLife 모바일 앱 v1 완성 (발주/정산/웨이팅/공지·문의)"
```
