export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const {
      name, contact_name, phone, biz_no, settlement_cycle, org_type, product_ids, email, password,
    } = await req.json() as {
      name: string; contact_name?: string; phone?: string; biz_no?: string
      settlement_cycle?: string; org_type: string; product_ids?: string[]
      email?: string; password?: string
    }

    if (!name || !org_type) {
      return NextResponse.json({ error: '상호명, 업체 유형 필수' }, { status: 400 })
    }

    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const adminDb = createAdminClient()

    // 1. 조직 생성
    const { data: org, error: orgErr } = await adminDb
      .from('organizations')
      .insert({ name, organization_type: org_type, status: 'active' })
      .select('id')
      .single()
    if (orgErr || !org) throw orgErr ?? new Error('조직 생성 실패')
    const orgId = org.id

    // 2. 연락처
    if (contact_name || phone) {
      await adminDb
        .from('contacts')
        .insert({ organization_id: orgId, name: contact_name ?? '', phone: phone ?? '', is_primary: true })
    }

    // 3. 식당 or 공급처
    let entityId: string | null = null
    if (org_type === 'restaurant') {
      const { data: rest } = await adminDb
        .from('restaurants')
        .insert({
          organization_id: orgId,
          biz_no: biz_no ?? null,
          settlement_cycle: settlement_cycle ?? 'weekly',
          waiting_enabled: false,
        })
        .select('id')
        .single()
      entityId = rest?.id ?? null

      if (product_ids?.length && entityId) {
        await adminDb
          .from('restaurant_products')
          .insert(product_ids.map(pid => ({ restaurant_id: entityId, product_id: pid })))
      }
    } else {
      const { data: supp } = await adminDb
        .from('suppliers')
        .insert({ organization_id: orgId })
        .select('id')
        .single()
      entityId = supp?.id ?? null

      if (product_ids?.length && entityId) {
        await adminDb
          .from('supplier_products')
          .insert(product_ids.map(pid => ({ supplier_id: entityId, product_id: pid, purchase_unit: '', supplier_name: name })))
      }
    }

    // 4. 로그인 계정 생성
    let warning: string | null = null
    if (email) {
      try {
        const { data: authData, error: authErr } = await adminDb.auth.admin.createUser({
          email,
          password: password || 'aaaa1111',
          email_confirm: true,
        })
        if (authErr) {
          warning = `계정 생성 실패: ${authErr.message}`
        } else if (authData?.user) {
          await adminDb.from('users').upsert({ id: authData.user.id, email })
          await adminDb.from('memberships').insert({ user_id: authData.user.id, organization_id: orgId })
        }
      } catch (e) {
        warning = `계정 생성 중 오류: ${e instanceof Error ? e.message : '알 수 없는 오류'}`
      }
    }

    return NextResponse.json({ orgId, ...(warning ? { warning } : {}) })
  } catch (e) {
    console.error('[POST /api/admin/members]', e)
    return NextResponse.json({ error: '등록 실패' }, { status: 500 })
  }
}
