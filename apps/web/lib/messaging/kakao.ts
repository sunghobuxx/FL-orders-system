/**
 * Solapi 메시징 모듈 (IP 제한 없음)
 * - 카카오 알림톡(ATA) 우선 발송, 실패 시 SMS 자동 대체
 * - Edge runtime 호환 (Web Crypto API 사용)
 */

export interface KakaoMessage {
  receiverNum: string
  templateId: string
  templateBody: string
  variables: Record<string, string>
}

interface SendResult {
  success: boolean
  externalId?: string
  error?: string
}

async function buildAuthHeader(apiKey: string, apiSecret: string): Promise<string> {
  const date = new Date().toISOString()
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => chars[b % chars.length]).join('')

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(date + salt))
  const signature = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, '0')).join('')

  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`
}

async function solapiRequest(
  apiKey: string,
  apiSecret: string,
  messages: object[]
): Promise<{ success: boolean; groupId?: string; error?: string }> {
  const auth = await buildAuthHeader(apiKey, apiSecret)
  const res = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ messages, allowDuplicates: false }),
  })

  const json = await res.json() as {
    groupInfo?: { groupId?: string; count?: { sentFailed?: number; total?: number } }
    failedMessageList?: { errorCode?: string; errorMessage?: string }[]
    errorCode?: string
    errorMessage?: string
  }

  if (!res.ok) {
    return { success: false, error: json.errorMessage ?? `HTTP ${res.status}` }
  }

  const failed = json.failedMessageList ?? []
  const total = json.groupInfo?.count?.total ?? 0
  if (failed.length > 0 && total > 0 && failed.length >= total) {
    return { success: false, error: failed[0]?.errorMessage ?? '발송 실패' }
  }

  return { success: true, groupId: json.groupInfo?.groupId }
}

export async function sendKakaoAlimtalk(msg: KakaoMessage): Promise<SendResult> {
  const apiKey = process.env.SOLAPI_API_KEY
  const apiSecret = process.env.SOLAPI_API_SECRET

  if (!apiKey || !apiSecret) {
    return { success: false, error: 'Solapi API 설정이 없습니다' }
  }

  const sender = process.env.SOLAPI_SENDER ?? ''
  const pfId = process.env.SOLAPI_KAKAO_PF_ID ?? ''

  // 템플릿 변수 치환 (SMS 대체 발송용 본문)
  const filledText = Object.entries(msg.variables).reduce(
    (t, [k, v]) => t.replaceAll(`#{${k}}`, v),
    msg.templateBody
  )

  // 알림톡 가능 여부 확인
  if (!pfId || !msg.templateId) {
    return sendSms(msg.receiverNum, filledText)
  }

  try {
    // Solapi 변수 형식: { "#{변수명}": "값" }
    const variables = Object.fromEntries(
      Object.entries(msg.variables).map(([k, v]) => [`#{${k}}`, v])
    )

    const result = await solapiRequest(apiKey, apiSecret, [{
      to: msg.receiverNum,
      from: sender,
      text: filledText,
      type: 'ATA',
      kakaoOptions: { pfId, templateId: msg.templateId, variables },
    }])

    if (!result.success) {
      // 알림톡 실패 시 SMS 자동 대체
      return sendSms(msg.receiverNum, filledText)
    }

    return { success: true, externalId: result.groupId }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export async function sendSms(phone: string, text: string): Promise<SendResult> {
  const apiKey = process.env.SOLAPI_API_KEY
  const apiSecret = process.env.SOLAPI_API_SECRET
  const sender = process.env.SOLAPI_SENDER ?? ''

  if (!apiKey || !apiSecret || !sender) {
    return { success: false, error: 'Solapi API 또는 발신번호 설정이 없습니다' }
  }

  try {
    const result = await solapiRequest(apiKey, apiSecret, [{
      to: phone,
      from: sender,
      text,
      autoTypeDetect: true,
    }])

    return result.success
      ? { success: true, externalId: result.groupId }
      : { success: false, error: result.error }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}
