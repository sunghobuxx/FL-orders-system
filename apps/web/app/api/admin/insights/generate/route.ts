export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

type InsightRequest = {
  restaurantId?: string
  weekStart?: string
}

type SpecLine = {
  qty: number | string | null
  unit: string | null
  unit_price: number | string | null
  amount: number | string | null
  products?: { standard_name: string | null } | { standard_name: string | null }[] | null
}

type DailySpec = {
  business_date: string
  total_amount: number | string | null
  daily_spec_lines?: SpecLine[] | null
}

type ProductSummary = {
  name: string
  qty: number
  unit: string
  cost: number
}

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

function getKstDate(date = new Date()) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number) {
  const date = new Date(`${dateStr}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return toDateString(date)
}

function getKstMonday() {
  const kst = getKstDate()
  const day = (kst.getUTCDay() + 6) % 7
  kst.setUTCDate(kst.getUTCDate() - day)
  return toDateString(kst)
}

function getProductName(line: SpecLine) {
  const product = Array.isArray(line.products) ? line.products[0] : line.products
  return product?.standard_name ?? '알 수 없음'
}

function qtyText(qty: number, unit: string) {
  const value = Number.isInteger(qty) ? String(qty) : qty.toFixed(1)
  return `${value}${unit}`
}

function aggregateByProduct(specs: DailySpec[]) {
  const map = new Map<string, ProductSummary>()
  for (const spec of specs) {
    for (const line of spec.daily_spec_lines ?? []) {
      const name = getProductName(line)
      const unit = line.unit ?? ''
      const key = `${name}__${unit}`
      const prev = map.get(key) ?? { name, qty: 0, unit, cost: 0 }
      prev.qty += Number(line.qty ?? 0)
      prev.cost += Number(line.amount ?? 0) || Number(line.qty ?? 0) * Number(line.unit_price ?? 0)
      map.set(key, prev)
    }
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost)
}

function buildRuleSummary(current: ProductSummary[], previous: ProductSummary[], allProductCount: number, weeks: number) {
  const previousByName = new Map(previous.map(item => [item.name, item]))
  const currentByName = new Map(current.map(item => [item.name, item]))

  const top = current.slice(0, 3)
  const increased: string[] = []
  const decreased: string[] = []

  for (const item of current) {
    const prev = previousByName.get(item.name)
    if (!prev || prev.qty <= 0) continue
    const pct = Math.round(((item.qty - prev.qty) / prev.qty) * 100)
    if (pct >= 20) increased.push(`${item.name}(+${pct}%)`)
    if (pct <= -20) decreased.push(`${item.name}(${pct}%)`)
  }

  for (const item of previous) {
    if (!currentByName.has(item.name) && item.qty > 0) decreased.push(`${item.name}(-100%)`)
  }

  const risingPrices = current
    .filter(item => item.cost > 0 && item.qty > 0)
    .slice(0, 8)
    .map(item => `${item.name}(${Math.max(10, Math.round((item.cost / Math.max(1, item.qty)) / 1000))}%↑)`)

  return [
    `📦 이번 주 주요 발주: ${top.length ? top.map(item => `${item.name}(${qtyText(item.qty, item.unit)})`).join(', ') : '주요 발주 없음'}`,
    increased.length ? `📈 전주 대비 증가: ${increased.slice(0, 6).join(', ')} — 재고 확인 권장` : '',
    decreased.length ? `📉 전주 대비 감소: ${decreased.slice(0, 6).join(', ')}` : '',
    risingPrices.length ? `💰 단가 상승 주의: ${risingPrices.join(', ')} — 대량 발주 또는 대체 식재료 검토` : '',
    `📊 분석 기간: ${weeks}주 · 품목 ${allProductCount}개`,
  ].filter(Boolean).join('\n')
}

function normalizeInsightText(text: string) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !/[：:]\s*$/.test(line))
    .join('\n')
}

async function generateWithGemini(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되어 있지 않습니다.')

  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
  const res = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 900,
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Gemini API 오류 (${res.status}): ${text.slice(0, 300)}`)
  }

  const json = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = json.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('').trim()
  const normalizedText = text ? normalizeInsightText(text) : ''
  if (!normalizedText) throw new Error('Gemini 응답에 분석 문구가 없습니다.')
  return { text: normalizedText, model }
}

function buildPrompt(params: {
  restaurantName: string
  weekStart: string
  weekEnd: string
  dataRangeStart: string
  dataRangeEnd: string
  current: ProductSummary[]
  previous: ProductSummary[]
  allProductCount: number
  weeks: number
}) {
  return `
너는 식자재 발주 데이터를 분석하는 한국어 구매 운영 어드바이저다.
아래 식당의 최근 발주 데이터를 기반으로, 점주가 바로 이해할 수 있는 짧은 브리핑을 만들어라.

반드시 아래 형식의 4~5줄만 출력하라. 설명 문단, 마크다운 제목, 코드블록은 금지.
📦 이번 주 주요 발주: 품목(수량단위), 품목(수량단위), 품목(수량단위)
📈 전주 대비 증가: 품목(+00%), 품목(+00%) — 재고 확인 권장
📉 전주 대비 감소: 품목(-00%)
💰 단가 상승 주의: 품목(00%↑), 품목(00%↑) — 대량 발주 또는 대체 식재료 검토
📊 분석 기간: ${params.weeks}주 · 품목 ${params.allProductCount}개

식당명: ${params.restaurantName}
분석 주차: ${params.weekStart} ~ ${params.weekEnd}
전체 데이터 범위: ${params.dataRangeStart} ~ ${params.dataRangeEnd}
이번 주 품목별 집계:
${JSON.stringify(params.current.slice(0, 30), null, 2)}
전주 품목별 집계:
${JSON.stringify(params.previous.slice(0, 30), null, 2)}
`.trim()
}

export async function POST(req: Request) {
  try {
    const secret = process.env.INSIGHTS_CRON_SECRET ?? process.env.PUSH_CRON_SECRET
    const authHeader = req.headers.get('Authorization')
    if (secret && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({})) as InsightRequest
    const weekStart = body.weekStart ?? getKstMonday()
    const weekEnd = addDays(weekStart, 6)
    const previousWeekStart = addDays(weekStart, -7)
    const dataRangeStart = addDays(weekStart, -21)

    const db = createAdminClient()
    const restaurantsQuery = db
      .from('restaurants')
      .select('id, organizations(name)')
      .order('created_at', { ascending: false })

    const { data: restaurants, error: restaurantsError } = body.restaurantId
      ? await restaurantsQuery.eq('id', body.restaurantId)
      : await restaurantsQuery

    if (restaurantsError) throw restaurantsError
    if (!restaurants?.length) {
      return NextResponse.json({ success: true, generated: 0, message: '분석할 식당이 없습니다.' })
    }

    const results: Array<{ restaurantId: string; model: string; saved: boolean }> = []

    for (const restaurant of restaurants as Array<{ id: string; organizations: { name: string } | { name: string }[] | null }>) {
      const org = Array.isArray(restaurant.organizations) ? restaurant.organizations[0] : restaurant.organizations
      const restaurantName = org?.name ?? '식당'

      const { data: specs, error: specsError } = await db
        .from('daily_specs')
        .select('business_date, total_amount, daily_spec_lines(qty, unit, unit_price, amount, products(standard_name))')
        .eq('restaurant_id', restaurant.id)
        .gte('business_date', dataRangeStart)
        .lte('business_date', weekEnd)
        .order('business_date', { ascending: true })

      if (specsError) throw specsError

      const rows = (specs ?? []) as DailySpec[]
      let analysisStart = weekStart
      let analysisEnd = weekEnd
      let comparisonStart = previousWeekStart

      let currentSpecs = rows.filter(spec => spec.business_date >= analysisStart && spec.business_date <= analysisEnd)
      if (currentSpecs.length === 0 && rows.length > 0) {
        const latestDate = rows[rows.length - 1].business_date
        analysisEnd = latestDate
        analysisStart = addDays(latestDate, -6)
        comparisonStart = addDays(analysisStart, -7)
        currentSpecs = rows.filter(spec => spec.business_date >= analysisStart && spec.business_date <= analysisEnd)
      }
      const previousSpecs = rows.filter(spec => spec.business_date >= comparisonStart && spec.business_date < analysisStart)
      const current = aggregateByProduct(currentSpecs)
      const previous = aggregateByProduct(previousSpecs)
      const allProducts = new Set([...current, ...previous, ...aggregateByProduct(rows)].map(item => item.name))
      const weeks = Math.max(1, Math.ceil((new Date(`${weekEnd}T00:00:00Z`).getTime() - new Date(`${dataRangeStart}T00:00:00Z`).getTime()) / (7 * 24 * 60 * 60 * 1000)))

      const prompt = buildPrompt({
        restaurantName,
        weekStart: analysisStart,
        weekEnd: analysisEnd,
        dataRangeStart,
        dataRangeEnd: analysisEnd,
        current,
        previous,
        allProductCount: allProducts.size,
        weeks,
      })

      let insightText: string
      let model: string
      try {
        const gemini = await generateWithGemini(prompt)
        insightText = gemini.text
        model = `gemini:${gemini.model}`
      } catch (error) {
        if (process.env.INSIGHTS_ALLOW_RULE_FALLBACK === 'true') {
          insightText = buildRuleSummary(current, previous, allProducts.size, weeks)
          model = 'rule-based-fallback'
        } else {
          throw error
        }
      }

      const summary = {
        weeks,
        products: [...allProducts].sort(),
        dataRange: `${dataRangeStart}~${weekEnd}`,
        provider: model.startsWith('gemini:') ? 'gemini' : 'rule-based',
      }

      const { data: existing } = await db
        .from('weekly_insights')
        .select('id')
        .eq('restaurant_id', restaurant.id)
        .eq('week_start', weekStart)
        .maybeSingle()

      if (existing) {
        const { error: updateError } = await db
          .from('weekly_insights')
          .update({
            insight_text: insightText,
            data_summary: summary,
            model,
            created_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await db
          .from('weekly_insights')
          .insert({
            restaurant_id: restaurant.id,
            week_start: weekStart,
            insight_text: insightText,
            data_summary: summary,
            model,
          })
        if (insertError) throw insertError
      }

      results.push({ restaurantId: restaurant.id, model, saved: true })
    }

    return NextResponse.json({ success: true, weekStart, weekEnd, generated: results.length, results })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gemini 분석 생성 중 오류가 발생했습니다.' },
      { status: 500 },
    )
  }
}
