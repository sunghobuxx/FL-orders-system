/**
 * 낡은 발주 화면에서 온 제출인지 본다.
 *
 * `/api/member/orders` 는 제출을 받을 때마다 그 발주의 **품목을 전부 지우고 다시 넣는다.**
 * 그래서 화면에 기존 품목이 안 실린 채로 제출되면 안 보낸 품목이 통째로 사라진다.
 * 2026-09-11 일산킨텍스가 그렇게 당했다 — 제출 뒤 뒤로 가기로 돌아온 빈 발주서에서
 * 꽃상추 하나만 보내, 앞서 넣은 품목이 전부 지워진 채 발주 문자까지 나갔다.
 *
 * 화면이 "이 발주를 고치는 중" 이라고 알려주면(orderId), 서버의 최신 발주와 맞춰볼 수 있다.
 * 어긋나면 그 화면은 낡았다 — 지우지 말고 돌려보낸다.
 *
 * `declaresOrderState` 가 false 인 것은 **발주 번호를 아예 안 보내는 구버전 모바일 앱**이다.
 * 판단할 근거가 없으므로 막지 않는다. 앱이 orderId 를 보내기 시작하면 앱도 같이 보호된다.
 */
export function isStaleOrderSubmit(args: {
  /** 요청이 orderId 를 명시했는지 (null 도 "없음" 이라는 명시다) */
  declaresOrderState: boolean
  clientOrderId: string | null
  serverOrderId: string | null
}): boolean {
  if (!args.declaresOrderState) return false
  return (args.clientOrderId ?? null) !== (args.serverOrderId ?? null)
}
