export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminSession } from '@/lib/admin-member-user'

/**
 * 가락시장 경매 실적을 하루치 집계해 market_daily_prices 에 저장한다.
 *
 * 공공데이터포털 «전국 공영도매시장 실시간 경매정보»
 *   https://apis.data.go.kr/B552845/katRealTime2/trades2
 *   필수 요청변수는 serviceKey 와 cond[trd_clcln_ymd::EQ] (거래정산일자, YYYY-MM-DD).
 *   날짜를 빼면 다른 조건이 맞아도 늘 0 건이 온다.
 *
 * 서울가락(110001)만 모은다. 우리 매입이 가락 중심이다.
 * 낙찰 건별 자료라 하루가 4만 건이 넘는다. 그대로 두면 비교를 할 수 없어
 * 품목·단위별 가중평균가와 반입량으로 줄여 쌓는다.
 *
 * 수집은 여기 한 곳뿐이다. 회원 화면(반입량)과 어드민 화면(시세)이 같은 저장분을 읽어야
 * 두 화면 숫자가 어긋나지 않는다.
 */

const MARKET_CODE = '110001'
const PAGE_SIZE = 1000

interface Trade {
  gds_mclsf_nm?: string
  whsl_mrkt_nm?: string
  /** 포장 하나당 낙찰가(원). 단위당 가격이 아니다. */
  scsbd_prc?: string
  /** 낙찰된 포장 수 */
  qty?: string
  /** 포장 하나의 물량 (예: 10) */
  unit_qty?: string
  /** 단위명 (예: kg) */
  unit_nm?: string
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0
  return Number(String(v).replace(/,/g, '')) || 0
}

async function fetchDay(serviceKey: string, date: string): Promise<Trade[]> {
  const rows: Trade[] = []
  const cond = encodeURIComponent('cond[trd_clcln_ymd::EQ]')
  const mkt = encodeURIComponent('cond[whsl_mrkt_cd::EQ]')

  for (let page = 1; page <= 60; page++) {
    const url = 'https://apis.data.go.kr/B552845/katRealTime2/trades2'
      + `?serviceKey=${serviceKey}&pageNo=${page}&numOfRows=${PAGE_SIZE}&returnType=json`
      + `&${cond}=${date}&${mkt}=${MARKET_CODE}`
      + '&selectable=gds_mclsf_nm,whsl_mrkt_nm,scsbd_prc,qty,unit_qty,unit_nm'

    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`API 오류: ${res.status}`)

    const json = await res.json() as {
      response?: { header?: { resultCode?: string }; body?: { items?: { item?: Trade | Trade[] } } }
    }
    const code = json.response?.header?.resultCode
    if (code && code !== '0' && code !== '00') throw new Error(`결과코드: ${code}`)

    const raw = json.response?.body?.items?.item
    const list = Array.isArray(raw) ? raw : raw ? [raw] : []
    rows.push(...list)
    if (list.length < PAGE_SIZE) break
  }
  return rows
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.PUSH_CRON_SECRET
    const isCron = Boolean(secret) && req.headers.get('Authorization') === `Bearer ${secret}`
    if (!isCron) {
      // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
      const session = await getAdminSession()
      if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
      const { user } = session
    }

    const serviceKey = process.env.PUBLIC_DATA_SERVICE_KEY
    if (!serviceKey) return NextResponse.json({ error: 'API 키 미설정' }, { status: 500 })

    const body = await req.json().catch(() => ({})) as { date?: string }
    // 기본은 오늘(KST). 경매는 오전에 끝나므로 저녁에 돌리면 그날 자료가 온전하다.
    const date = body.date ?? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)

    const trades = await fetchDay(serviceKey, date)
    if (!trades.length) {
      return NextResponse.json({ success: true, date, trades: 0, saved: 0, message: '경매 자료 없음(휴장일)' })
    }

    // 품목·단위별로 묶는다.
    //
    // scsbd_prc 는 **포장 하나당** 낙찰가이고, 그 포장의 물량이 unit_qty 다.
    //   수박 18,000원 / 단위물량 10kg  →  kg 당 1,800원
    // 이걸 나누지 않으면 포장 가격이 단위 가격으로 잡힌다(깐마늘이 kg당 70,750원으로 나왔다).
    //
    // 총 물량 = 포장 수(qty) × 포장당 물량(unit_qty)
    // 가중평균 단가 = Σ(낙찰가 × 포장 수) ÷ 총 물량
    const agg = new Map<string, {
      mclsf: string; unit: string; market: string; sumAmount: number; qty: number; count: number
    }>()
    for (const t of trades) {
      const mclsf = (t.gds_mclsf_nm ?? '').trim()
      if (!mclsf) continue
      const packs = num(t.qty)
      const price = num(t.scsbd_prc)
      const unitQty = num(t.unit_qty)
      if (packs <= 0 || price <= 0 || unitQty <= 0) continue

      const unit = (t.unit_nm ?? '').trim()
      const key = `${mclsf}|${unit}`
      const cur = agg.get(key) ?? {
        mclsf, unit, market: t.whsl_mrkt_nm ?? '서울가락', sumAmount: 0, qty: 0, count: 0,
      }
      cur.sumAmount += price * packs        // 낙찰 총액
      cur.qty += packs * unitQty            // 총 물량 (kg 등)
      cur.count += 1
      agg.set(key, cur)
    }

    const rows = [...agg.values()].map(a => ({
      trade_date: date,
      market_code: MARKET_CODE,
      market_name: a.market,
      mclsf_name: a.mclsf,
      unit_name: a.unit,
      avg_price: Math.round(a.sumAmount / a.qty),   // 단위(kg 등) 당 가격
      total_qty: a.qty,
      trade_count: a.count,
      updated_at: new Date().toISOString(),
    }))

    const db = createAdminClient()
    // 같은 날짜를 다시 돌려도 결과가 같아야 한다.
    const { error } = await db
      .from('market_daily_prices')
      .upsert(rows, { onConflict: 'trade_date,market_code,mclsf_name,unit_name' })
    if (error) {
      console.error('[market/collect] 저장 실패', error)
      return NextResponse.json({ error: `저장 실패: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, date, trades: trades.length, saved: rows.length })
  } catch (e) {
    console.error('[POST /api/admin/market/collect]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '수집 중 오류가 발생했습니다' },
      { status: 500 },
    )
  }
}
