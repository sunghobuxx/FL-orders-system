export const runtime = 'edge'

import { sendSms } from '@/lib/messaging/kakao'

export async function GET() {
  const result = await sendSms('01086805475', '[FruitLife] Solapi SMS 테스트 발송입니다.')
  return Response.json(result)
}
