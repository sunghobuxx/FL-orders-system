/** 가락업체(dispatch_group = 'garak')는 발주 문자를 보내지 않는다. 가락 품목은 가락 살 것 목록·확인 버튼으로만 처리한다. */
export function isGarakDispatchGroup(group: string | null | undefined): boolean {
  return group === 'garak'
}

export const GARAK_SUPPLIER_BLOCKED_MESSAGE = '가락업체에는 발주 문자를 보내지 않습니다'
