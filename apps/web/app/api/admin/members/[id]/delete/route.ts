export const runtime = 'edge'

import { type NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

/**
 * 회원(조직) 실제 삭제.
 *
 * 그동안 이 라우트가 없어서 삭제 버튼이 404 로 실패하고 있었다.
 *
 * 거래 이력(발주·명세서·정산서·미수금)이 있으면 지우지 않는다. FK 가 NO ACTION 이라
 * DB 에서도 막히고, 억지로 지우면 정산 내역이 깨진다. 이 경우 비활성으로 안내한다.
 */
export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: orgId } = await context.params
    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

    const db = createAdminClient()

    const { data: org } = await db
      .from('organizations').select('id, name, organization_type').eq('id', orgId).maybeSingle()
    if (!org) return NextResponse.json({ error: '업체를 찾을 수 없습니다' }, { status: 404 })

    const [{ data: restaurants }, { data: suppliers }] = await Promise.all([
      db.from('restaurants').select('id').eq('organization_id', orgId),
      db.from('suppliers').select('id').eq('organization_id', orgId),
    ])
    const restIds = (restaurants ?? []).map((r: { id: string }) => r.id)
    const supIds = (suppliers ?? []).map((s: { id: string }) => s.id)

    // 거래 이력 확인 — 하나라도 있으면 삭제하지 않는다
    const blockers: string[] = []
    if (restIds.length) {
      const checks: Array<[string, string]> = [
        ['order_batches', '발주'],
        ['daily_specs', '명세서'],
        ['sales_statements', '정산서'],
        ['receivables', '미수금'],
      ]
      for (const [table, label] of checks) {
        const { count } = await db.from(table)
          .select('id', { count: 'exact', head: true })
          .in('restaurant_id', restIds)
        if (count) blockers.push(`${label} ${count}건`)
      }
    }
    if (supIds.length) {
      const { count: jobs } = await db.from('dispatch_jobs')
        .select('id', { count: 'exact', head: true }).in('supplier_id', supIds)
      if (jobs) blockers.push(`발주 발송 ${jobs}건`)
      const { count: purchases } = await db.from('purchase_items')
        .select('id', { count: 'exact', head: true }).in('supplier_id', supIds)
      if (purchases) blockers.push(`매입 ${purchases}건`)
    }

    if (blockers.length) {
      return NextResponse.json({
        error: `거래 이력이 있어 삭제할 수 없습니다 (${blockers.join(', ')}). 대신 '비활성'으로 숨겨주세요.`,
      }, { status: 409 })
    }

    // 이력이 없으면 자식부터 정리 후 삭제한다.
    // memberships·contacts·restaurant_products 등은 FK 가 CASCADE 라 함께 지워진다.
    if (supIds.length) {
      await db.from('supplier_products').delete().in('supplier_id', supIds)
      await db.from('suppliers').delete().in('id', supIds)
    }
    if (restIds.length) {
      await db.from('restaurants').delete().in('id', restIds)
    }

    const { error } = await db.from('organizations').delete().eq('id', orgId)
    if (error) {
      console.error('[DELETE /api/admin/members/[id]/delete]', error)
      return NextResponse.json({ error: `삭제 실패: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, deleted: org.name })
  } catch (e) {
    console.error('[DELETE /api/admin/members/[id]/delete] unexpected', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
