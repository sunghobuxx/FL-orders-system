/**
 * 회원 등록 시 로그인 이메일 검사.
 *
 * **매출 업체는 로그인 이메일 없이는 등록할 수 없다.** 이메일 없이 등록된 업체는
 * 로그인 계정이 없어서, 나중에 「업체 로그인 이메일 변경」으로 고치려 해도
 * 「이 업체의 로그인 계정을 찾을 수 없습니다」 가 나온다. 처음부터 막는다.
 *
 * 매입 공급처는 로그인하지 않으므로 비워도 된다(적었다면 형식은 맞아야 한다).
 */

// 「업체 로그인 이메일 변경」(members/[id]/email) 과 같은 규칙
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type LoginEmailResult =
  | { ok: true; email: string | null }
  | { ok: false; error: string }

export function validateLoginEmail(
  orgType: string,
  raw: string | null | undefined,
): LoginEmailResult {
  const email = (raw ?? '').trim().toLowerCase()

  if (!email) {
    if (orgType === 'supplier') return { ok: true, email: null }
    return { ok: false, error: '로그인 이메일을 입력해주세요. 이메일이 없으면 등록할 수 없습니다.' }
  }
  if (!EMAIL_RE.test(email)) return { ok: false, error: '올바른 이메일 주소를 입력해주세요' }
  return { ok: true, email }
}
