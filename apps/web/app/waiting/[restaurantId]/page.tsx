export const runtime = 'edge'

import { createAdminClient } from '@/lib/supabase/admin'
import DefaultWaitingForm from './DefaultWaitingForm'
import HanmaeWaitingForm from './HanmaeWaitingForm'

/**
 * 매장에 둔 QR 코드가 가리키는 공개 대기 등록 페이지.
 * 할매솥뚜껑삼겹살 매장은 그 매장 브랜드 톤앤매너로, 나머지는 기존 FruitLife 디자인 그대로 보여준다
 * (2026-10-07, 매장 QR 보드 디자인 참고).
 */
export default async function WaitingPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params

  const db = createAdminClient()
  const { data } = await db
    .from('restaurants')
    .select('id, organizations(name)')
    .eq('id', restaurantId)
    .maybeSingle()
  type Row = { organizations: { name: string } | null } | null
  const orgName = (data as unknown as Row)?.organizations?.name ?? null

  if (orgName?.startsWith('할매솥뚜껑')) {
    const branchName = orgName.replace(/^할매솥뚜껑삼겹살\s*/, '').trim() || orgName
    return <HanmaeWaitingForm restaurantId={restaurantId} branchName={branchName} />
  }

  return <DefaultWaitingForm restaurantId={restaurantId} />
}
