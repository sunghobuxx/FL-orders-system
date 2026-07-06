export const runtime = 'edge'

export async function GET() {
  const serviceKey = process.env.PUBLIC_DATA_SERVICE_KEY
  if (!serviceKey) return Response.json({ error: 'API 키 없음' })

  // 필터 없이 전체 조회
  const params = new URLSearchParams({
    pageNo: '1', numOfRows: '300', returnType: 'json',
  })
  const url = `https://apis.data.go.kr/B552845/katForecast/electronicInvoicePurchases?serviceKey=${serviceKey}&${params}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const raw = await res.json() as { response?: { header?: unknown; body?: { items?: { item?: unknown[] }; totalCount?: number } } }

  const items = raw.response?.body?.items?.item ?? []
  const totalCount = raw.response?.body?.totalCount ?? 0
  const header = raw.response?.header

  const allNames = (items as Record<string, unknown>[]).map(i => `${i['gds_mclsf_nm']} (${i['gds_lclsf_nm']})`)
  return Response.json({ header, totalCount, allNames })
}
