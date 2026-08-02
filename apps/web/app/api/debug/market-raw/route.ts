export const runtime = 'edge'

/**
 * 가락시장 전자송품장 매입예측 API 응답 확인용.
 *
 * 예전에는 응답에서 품목명만 뽑아 돌려줬다. 그래서 응답이 비었을 때
 * (2026-08-02 기준 totalCount 0, header null) 왜 비었는지 알 수 없었다.
 * 원문과 상태코드를 그대로 보여 준다.
 *
 * 쿼리로 파라미터를 바꿔 가며 시험할 수 있다. 배포를 다시 하지 않아도 된다.
 *   ?path=electronicInvoicePurchases   호출할 오퍼레이션
 *   ?rows=300                          numOfRows
 *   ?date=20260801                     날짜 파라미터가 필요한 경우
 *   ?param=delngDe                     날짜를 넘길 파라미터 이름 (기본 delngDe)
 */
export async function GET(req: Request) {
  const serviceKey = process.env.PUBLIC_DATA_SERVICE_KEY
  if (!serviceKey) return Response.json({ error: 'API 키 없음 (PUBLIC_DATA_SERVICE_KEY)' })

  const q = new URL(req.url).searchParams
  const path = q.get('path') ?? 'electronicInvoicePurchases'
  const params = new URLSearchParams({
    pageNo: q.get('page') ?? '1',
    numOfRows: q.get('rows') ?? '300',
    returnType: 'json',
  })
  const date = q.get('date')
  if (date) params.set(q.get('param') ?? 'delngDe', date)

  const url = `https://apis.data.go.kr/B552845/katForecast/${path}?serviceKey=${serviceKey}&${params}`

  let status = 0
  let text = ''
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    status = res.status
    text = await res.text()
  } catch (e) {
    return Response.json({ requested: `${path}?${params}`, fetchError: String(e) })
  }

  let parsed: unknown = null
  try { parsed = JSON.parse(text) } catch { /* JSON 이 아니면 원문으로 본다 */ }

  const body = (parsed as { response?: { body?: { items?: { item?: unknown[] }; totalCount?: number } } } | null)
    ?.response?.body
  const items = (body?.items?.item ?? []) as Record<string, unknown>[]

  return Response.json({
    requested: `${path}?${params}`,
    httpStatus: status,
    // 응답이 비면 여기서 이유가 보인다 (NODATA_ERROR, SERVICE_KEY_IS_NOT_REGISTERED_ERROR 등)
    rawHead: text.slice(0, 1200),
    totalCount: body?.totalCount ?? null,
    itemCount: items.length,
    firstItem: items[0] ?? null,
    names: items.map(i => `${i['gds_mclsf_nm'] ?? '?'} (${i['gds_lclsf_nm'] ?? '?'})`).slice(0, 100),
  })
}
