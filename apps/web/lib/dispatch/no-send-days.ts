/**
 * 일요일 배송 발주는 공급처 발주 문자를 보내지 않는다(사장님, 2026-10-04).
 * 일요일 발주 내역은 화면에서 확인만 하고, 문자는 나가지 않는다.
 */
export function isDispatchBlockedDate(businessDate: string): boolean {
  return new Date(`${businessDate}T00:00:00Z`).getUTCDay() === 0
}

export const DISPATCH_BLOCKED_MESSAGE = '일요일 배송 발주는 발주 문자를 보내지 않습니다'
