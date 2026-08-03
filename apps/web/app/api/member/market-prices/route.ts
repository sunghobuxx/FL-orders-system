export const runtime = 'edge'

import { NextResponse } from 'next/server'

/**
 * 가락시장 출하물량 예측 (수급위험 예측의 데이터 공급원).
 *
 * 공공데이터포털 «한국농수산식품유통공사_도매시장 전자송품장 출하구매물량 예측정보»
 *   https://apis.data.go.kr/B552845/katForecast/electronicInvoiceShipments
 *   필수 요청변수는 serviceKey 하나. 날짜 조건은 명세에 없다.
 *   거를 수 있는 건 cond[whsl_mrkt_cd::EQ] (도매시장), cond[gds_lclsf_cd|gds_mclsf_cd::EQ] (품목) 뿐이다.
 *
 * 이 파일은 2026-06-22 빌드 산출물에서 복원했다. git 을 거치지 않은 배포가 있었고
 * 그 뒤 복원 과정에서 이 라우트와 SupplyRiskSection 컴포넌트가 통째로 빠져 있었다.
 * 그동안 회원 대시보드의 수급위험 영역은 하드코딩된 문구만 보여 주고 있었다.
 *
 * 2026-08-03 확인: API 는 살아 있으나(resultCode 0, 정상) totalCount 가 0 이다.
 * 시장코드·품목코드·XML/JSON 어느 조합으로도 0 건이고, 매입(Purchases) 오퍼레이션은
 * 이미 폐기됐다(NO_OPENAPI_SERVICE_ERROR). 포털 개편이 끝난 뒤 다시 확인할 것.
 */

/** 우리 품목명 → 가락시장 분류명 후보. 부분일치까지 허용한다. */
const PRODUCT_ALIASES: Record<string, string[]> = {
  상추: ['상추', '꽃상추', '적상추', '청상추', '로메인', '양상추'],
  시금치: ['시금치'], 배추: ['배추', '절임배추'], 양배추: ['양배추'],
  적채: ['적채', '적양배추'], 깻잎: ['깻잎'], 부추: ['부추'], 쑥갓: ['쑥갓'],
  미나리: ['미나리'], 청경채: ['청경채'], 아욱: ['아욱'],
  열무: ['열무', '열무배추'], 치커리: ['치커리', '엔다이브'],
  양파: ['양파'], 적양파: ['적양파'], 대파: ['대파', '파'], 쪽파: ['쪽파', '실파'],
  마늘: ['마늘', '풋마늘'], 생강: ['생강'], 당근: ['당근'], 무: ['무', '총각무'],
  연근: ['연근'], 우엉: ['우엉'], 도라지: ['도라지'], 감자: ['감자'], 고구마: ['고구마'],
  청양고추: ['풋고추', '고추', '청양고추'], 피망: ['피망'], 파프리카: ['파프리카'],
  청오이: ['오이', '취청오이', '청오이'], 주키니호박: ['애호박', '호박', '주키니'],
  가지: ['가지'], 토마토: ['토마토'], 방울토마토: ['방울토마토', '대추방울토마토'],
  팽이버섯: ['팽이버섯', '팽이'], 느타리버섯: ['느타리버섯', '느타리'],
  새송이버섯: ['새송이버섯', '새송이'], 표고버섯: ['표고버섯', '표고'],
  양송이버섯: ['양송이버섯', '양송이'], 목이버섯: ['목이버섯', '목이'],
  콩나물: ['콩나물'], 숙주: ['숙주나물', '숙주'], 고사리: ['고사리'],
  취나물: ['취나물', '취'], 브로콜리: ['브로콜리'], 셀러리: ['셀러리', '샐러리'],
  궁채: ['궁채'],
  수박: ['수박'], 사과: ['사과'], 참외: ['참외'], 딸기: ['딸기'], 포도: ['포도'],
  배: ['배'], 복숭아: ['복숭아'], 감: ['감', '단감', '홍시'],
  귤: ['귤', '감귤', '한라봉', '천혜향'], 바나나: ['바나나'], 레몬: ['레몬'],
  키위: ['키위', '참다래'], 멜론: ['멜론'], 망고: ['망고'], 체리: ['체리'],
  자두: ['자두'], 블루베리: ['블루베리'],
}

export type SupplyRisk = 'critical' | 'high' | 'watch' | 'safe'

export interface Forecast {
  productName: string
  market: string
  predcQty: number
  prvmmQty: number
  /** 전월 대비 증감률. 비교 기준을 믿을 수 없으면 null */
  changeRate: number | null
  riskScore: number
  supplyRisk: SupplyRisk
  advice: string
  period: string
}

interface RawItem {
  gds_mclsf_nm?: string
  gds_lclsf_nm?: string
  whsl_mrkt_nm?: string
  predc_qty?: string | number
  prvmm_qty?: string | number
  llmt_predc_qty?: string | number
  uplmt_predc_qty?: string | number
  predc_prd?: string
  unit_nm?: string
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  return Number(String(v).replace(/,/g, '')) || 0
}

/**
 * 출하 예측 증감률로 위험도를 매긴다.
 *
 * 원래는 최대 45점인데 '위험'이 50점, '매우위험'이 75점부터라 그 두 단계에 절대
 * 도달할 수 없었다. 출하량이 반토막 나도 '주의'까지만 떴다. 임계값을 증감률에 직접 맞춘다.
 */
function scoreRisk(changeRate: number): { score: number; level: SupplyRisk } {
  if (changeRate <= -40) return { score: 80, level: 'critical' }
  if (changeRate <= -20) return { score: 60, level: 'high' }
  if (changeRate <= -10) return { score: 30, level: 'watch' }
  return { score: 0, level: 'safe' }
}

function buildAdvice(level: SupplyRisk, changeRate: number, base: number): string {
  if (base === 0) return '이번 주 출하 예측 데이터가 있습니다. 전월 비교 데이터가 아직 없어 추이 분석이 어렵습니다.'
  const abs = Math.abs(changeRate).toFixed(1)
  if (level === 'critical') return `향후 7일간 출하예측량이 전월 대비 ${abs}% 급감 예상. 수급 불안 위험이 매우 높아 2~3일치 선발주를 강력 권장합니다.`
  if (level === 'high') return `향후 7일간 출하예측량이 전월 대비 ${abs}% 감소 예상. 수급 불안 가능성이 있어 2~3일치 선발주를 검토해보세요.`
  if (level === 'watch') return `출하예측량이 전월 대비 ${abs}% 감소 예상. 단기적으로 물량 확보 경쟁이 생길 수 있으니 발주 시점을 앞당기는 것이 좋습니다.`
  if (changeRate > 20) return `공급 예측량이 전월 대비 ${changeRate.toFixed(1)}% 증가 예상. 가격 하락 가능성이 있으니 평소 발주량을 유지하세요.`
  return '공급량이 안정적입니다. 평소 발주량을 유지하세요.'
}

async function fetchForecast(serviceKey: string, opts: { marketCode?: string } = {}) {
  const params = new URLSearchParams({ pageNo: '1', numOfRows: '1000', returnType: 'json' })
  let query = params.toString()
  // cond[...] 는 대괄호를 그대로 보내야 한다. URLSearchParams 로 넣으면 인코딩되어 안 먹는다.
  if (opts.marketCode) query += `&cond[whsl_mrkt_cd::EQ]=${opts.marketCode}`

  const url = `https://apis.data.go.kr/B552845/katForecast/electronicInvoiceShipments?serviceKey=${serviceKey}&${query}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`API 오류: ${res.status}`)

  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('xml')) throw new Error('API가 XML 을 반환했습니다')

  let json: { response?: { header?: { resultCode?: string }; body?: { items?: { item?: RawItem | RawItem[] } } } }
  try { json = await res.json() } catch { throw new Error('API 응답 파싱 실패 (JSON 아님)') }

  const code = json.response?.header?.resultCode
  if (code && code !== '00' && code !== '0') throw new Error(`결과코드: ${code}`)

  const raw = json.response?.body?.items?.item
  const list: RawItem[] = Array.isArray(raw) ? raw : raw ? [raw] : []

  const sampleNames = [...new Set(
    list.slice(0, 50).flatMap(i => [i.gds_mclsf_nm, i.gds_lclsf_nm].filter(Boolean) as string[]),
  )]

  // 전월물량이 모든 행에서 같으면 품목별 값이 아니다. 그걸로 증감률을 내면 안 된다.
  // 2026-08-03 실제 응답: 사과·포도·무·대파 모두 prvmm_qty 가 5,440,023 으로 동일했다.
  const baselines = new Set(list.map(i => String(i.prvmm_qty ?? '')))
  const baselineUsable = list.length <= 1 || baselines.size > 1

  const forecast: Record<string, Forecast> = {}
  for (const [standard, aliases] of Object.entries(PRODUCT_ALIASES)) {
    // 중분류(gds_mclsf_nm)만 본다. 대분류(과실류·근채류·조미채소류)는 품목이 아니다.
    // 부분일치도 쓰지 않는다. 예전에는 '무' 행이 '열무' 에, '토마토' 행이 '방울토마토' 에
    // 잘못 붙어 서로 다른 품목이 같은 물량으로 표시됐다.
    const hit = list.find(item => {
      const name = (item.gds_mclsf_nm ?? '').trim()
      return Boolean(name) && (name === standard || aliases.includes(name))
    })
    if (!hit) continue

    const predcQty = num(hit.predc_qty)
    const prvmm = num(hit.prvmm_qty)
    // 전월 물량이 없으면 상·하한 예측의 중간값을 기준으로 삼는다.
    const base = prvmm > 0 ? prvmm : (num(hit.llmt_predc_qty) + num(hit.uplmt_predc_qty)) / 2
    if (predcQty === 0 && base === 0) continue

    const changeRate = baselineUsable && base > 0 ? ((predcQty - base) / base) * 100 : null
    const { score, level } = changeRate === null
      ? { score: 0, level: 'safe' as SupplyRisk }
      : scoreRisk(changeRate)

    forecast[standard] = {
      productName: standard,
      market: hit.whsl_mrkt_nm ?? '서울가락',
      predcQty,
      prvmmQty: base,
      changeRate,
      riskScore: score,
      supplyRisk: level,
      advice: changeRate === null
        ? `가락시장이 준 전월 물량이 품목별로 구분되지 않아 증감 비교가 어렵습니다. 예측 물량은 ${Math.round(predcQty).toLocaleString('ko-KR')}${hit.unit_nm ?? ''} 입니다.`
        : buildAdvice(level, changeRate, base),
      period: hit.predc_prd ?? '',
    }
  }

  return { forecast, rawItemCount: list.length, sampleNames }
}

export async function GET() {
  const serviceKey = process.env.PUBLIC_DATA_SERVICE_KEY
  if (!serviceKey) {
    // 500 을 돌려주면 회원 대시보드가 오류로 보인다. 키가 없는 건 회원 잘못이 아니다.
    // (로컬에는 이 키가 없다. 운영 환경변수에만 있다)
    return NextResponse.json({
      success: true,
      forecast: {},
      debug: { rawItemCount: 0, sampleNames: [], errorDetail: 'API 키 미설정 (PUBLIC_DATA_SERVICE_KEY)' },
    })
  }

  try {
    // 서울가락(110001) 먼저. 0 건이면 시장 구분 없이 한 번 더 본다.
    const seoul = await fetchForecast(serviceKey, { marketCode: '110001' })
    if (seoul.rawItemCount === 0) {
      const all = await fetchForecast(serviceKey)
      return NextResponse.json({
        success: true,
        forecast: all.forecast,
        debug: { rawItemCount: all.rawItemCount, sampleNames: all.sampleNames, retried: true },
      })
    }
    return NextResponse.json({
      success: true,
      forecast: seoul.forecast,
      debug: { rawItemCount: seoul.rawItemCount, sampleNames: seoul.sampleNames },
    })
  } catch (e) {
    // 화면이 깨지지 않도록 200 으로 돌려주고 사유만 남긴다.
    return NextResponse.json({
      success: true,
      forecast: {},
      debug: { rawItemCount: 0, sampleNames: [], errorDetail: e instanceof Error ? e.message : '예측 불가' },
    })
  }
}
