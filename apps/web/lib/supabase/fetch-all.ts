/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * PostgREST 는 한 번 요청에 1000 행까지만 준다. 그걸 모르고 그냥 합산하던 화면들이 있었다.
 *
 * 2026-08-01 확인: 전체 매출관리의 7월 총매입이 25,166,880 원으로 떠 있었는데,
 * 실제로는 발주 품목 1579 건 중 1000 건만 더한 값이었다. 579 건 15,497,760 원이 빠졌다.
 * 금액을 다 더해야 하는 조회는 반드시 이 함수를 거친다.
 *
 * 쓰는 법 — 쿼리를 만드는 함수를 넘긴다. range() 를 붙여 여러 번 부르기 때문이다.
 *   const rows = await fetchAll(() => db.from('order_items').select('...').in('id', ids))
 */
export async function fetchAll<T = any>(
  makeQuery: () => any,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1)
    if (error) throw error
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < pageSize) return out
  }
}
