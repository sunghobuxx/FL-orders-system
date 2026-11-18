// 실제 거래처가 아닌 데모/테스트용 식당. 외부인 체험 계정(임시 식당)도 여기 넣는다.
// - 발주 문자(공급처)·가락 살 것 목록·배송앱 할 일에 들어가면 안 된다 (getCurrentDispatchGroups)
// - 매출·미수금 통계에 섞이면 안 된다 (2026-08-19 「테스트식당」 미수금이 대시보드 총액을 부풀린 전례)
export const TEST_RESTAURANT_IDS = [
  '7306bb64-4596-4a5e-92ab-6e9dd9395238', // 테스트 식당
  'f18d1e85-fa3e-43f1-a011-c8129915b5f1', // 임시 식당 — 외부인 체험 계정 (2026-11-18)
]

export function isTestRestaurant(restaurantId: string | null | undefined): boolean {
  return !!restaurantId && TEST_RESTAURANT_IDS.includes(restaurantId)
}
