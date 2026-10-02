import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchKakaoAddress } from './kakao-local'

const originalFetch = global.fetch
const originalKey = process.env.KAKAO_LOCAL_API_KEY

describe('searchKakaoAddress', () => {
  beforeEach(() => {
    process.env.KAKAO_LOCAL_API_KEY = 'test-key'
  })
  afterEach(() => {
    global.fetch = originalFetch
    process.env.KAKAO_LOCAL_API_KEY = originalKey
  })

  it('키가 없으면 바로 에러 — fetch 를 호출하지 않는다', async () => {
    delete process.env.KAKAO_LOCAL_API_KEY
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch
    await expect(searchKakaoAddress('가락시장')).rejects.toThrow('KAKAO_LOCAL_API_KEY')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('도로명 주소가 있으면 그걸 쓰고, 없으면 지번 주소로 대체한다', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        documents: [
          { place_name: '가락시장', road_address_name: '서울 송파구 양재대로 932', address_name: '서울 송파구 가락동 600' },
          { place_name: '빈주소', road_address_name: '', address_name: '서울 송파구 가락동 601' },
        ],
      }),
    }) as unknown as typeof fetch
    const result = await searchKakaoAddress('가락시장')
    expect(result).toEqual([
      { placeName: '가락시장', address: '서울 송파구 양재대로 932' },
      { placeName: '빈주소', address: '서울 송파구 가락동 601' },
    ])
  })

  it('주소가 둘 다 비어있으면 결과에서 뺀다', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ documents: [{ place_name: '주소없음', road_address_name: '', address_name: '' }] }),
    }) as unknown as typeof fetch
    const result = await searchKakaoAddress('x')
    expect(result).toEqual([])
  })

  it('API 응답이 실패하면 에러를 던진다', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch
    await expect(searchKakaoAddress('x')).rejects.toThrow('401')
  })
})
