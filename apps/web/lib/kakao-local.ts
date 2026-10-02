/**
 * 카카오 로컬 API(키워드로 장소 검색)로 업체명에서 주소 후보를 찾는다.
 * 서울 식당 판별에 주소가 필요해 추가 — 가락시장 매입 시작(2026-10).
 */
export interface KakaoAddressCandidate {
  placeName: string
  address: string
}

interface KakaoKeywordDocument {
  place_name: string
  road_address_name: string
  address_name: string
}

export async function searchKakaoAddress(query: string): Promise<KakaoAddressCandidate[]> {
  const apiKey = process.env.KAKAO_LOCAL_API_KEY
  if (!apiKey) throw new Error('KAKAO_LOCAL_API_KEY 가 설정되지 않았습니다')

  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${apiKey}` } })
  if (!res.ok) throw new Error(`카카오 API 오류 (${res.status})`)

  const data = await res.json() as { documents?: KakaoKeywordDocument[] }
  return (data.documents ?? [])
    .map(d => ({ placeName: d.place_name, address: d.road_address_name || d.address_name }))
    .filter(c => c.address)
}
