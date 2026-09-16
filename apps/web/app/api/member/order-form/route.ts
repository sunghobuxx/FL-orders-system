export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { getMemberSession } from '@/lib/member-session'
import { validDate } from '@/lib/member-settlement'

export async function GET(req: NextRequest) {
  const { user, supabase: db } = await getMemberSession(req)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const { data: member, error: memberError } = await db.from('memberships').select('organization_id').eq('user_id', user.id).maybeSingle()
  if (memberError || !member) return NextResponse.json({ error: '업체 정보를 확인할 수 없습니다.' }, { status: 403 })
  const { data: restaurant, error: restError } = await db.from('restaurants').select('id').eq('organization_id', member.organization_id).maybeSingle()
  if (restError || !restaurant) return NextResponse.json({ error: '식당 정보가 없습니다. 관리자에게 문의해주세요.' }, { status: 404 })
  const now = new Date(Date.now() + 9 * 3600000), today = now.toISOString().slice(0, 10)
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10)
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes()
  const { data: todayBatch, error: batchError } = await db.from('order_batches').select('id, business_date, status').eq('restaurant_id', restaurant.id).eq('business_date', today).maybeSingle()
  if (batchError) return NextResponse.json({ error: '발주 조회에 실패했습니다.' }, { status: 500 })
  const defaultDate = minutes >= 240 || (todayBatch && !['open', 'submitted'].includes(todayBatch.status)) ? tomorrow : today
  const date = req.nextUrl.searchParams.get('date') ?? defaultDate
  if (!validDate(date)) return NextResponse.json({ error: '올바른 배송일을 선택해주세요.' }, { status: 400 })
  const batchResult = date === today ? { data: todayBatch, error: null } : await db.from('order_batches').select('id, business_date, status').eq('restaurant_id', restaurant.id).eq('business_date', date).maybeSingle()
  if (batchResult.error) return NextResponse.json({ error: '발주 조회에 실패했습니다.' }, { status: 500 })
  const batch = batchResult.data
  const order = batch ? await db.from('orders').select('id').eq('batch_id', batch.id).order('created_at', { ascending: false }).limit(1).maybeSingle() : { data: null, error: null }
  if (order.error) return NextResponse.json({ error: '기존 발주 조회 실패' }, { status: 500 })
  const [items, whitelist] = await Promise.all([
    order.data ? db.from('order_items').select('product_id, qty, unit').eq('order_id', order.data.id) : Promise.resolve({ data: [], error: null }),
    db.from('restaurant_products').select('product_id, added_by').eq('restaurant_id', restaurant.id).order('display_order'),
  ])
  if (items.error || whitelist.error) return NextResponse.json({ error: '기존 발주 품목 조회 실패' }, { status: 500 })
  const savedIds = (items.data ?? []).map(item => item.product_id)
  const listedIds = (whitelist.data ?? []).map(item => item.product_id)
  const fields = 'id, standard_name, default_unit, allowed_units, category, pack_unit, kg_per_pack, status'
  let query = db.from('products').select(fields)
  // Keep already-ordered items even if they were removed from the whitelist.
  query = listedIds.length ? query.in('id', [...new Set([...listedIds, ...savedIds])]) : query.eq('status', 'active').order('category').order('standard_name')
  const master = await query
  if (master.error) return NextResponse.json({ error: '품목 조회 실패' }, { status: 500 })
  const missingIds = savedIds.filter(id => !(master.data ?? []).some(p => p.id === id))
  const missing = missingIds.length ? await db.from('products').select(fields).in('id', missingIds) : { data: [], error: null }
  if (missing.error) return NextResponse.json({ error: '기존 품목 조회 실패' }, { status: 500 })
  const added = new Map((whitelist.data ?? []).map(item => [item.product_id, item.added_by]))
  const products = [...(master.data ?? []), ...(missing.data ?? [])].filter(p => p.status === 'active' || savedIds.includes(p.id)).map(p => ({ ...p, added_by: added.get(p.id) ?? 'admin' }))
  if (listedIds.length) products.sort((a, b) => listedIds.indexOf(a.id) - listedIds.indexOf(b.id))
  const quantities: Record<string, string> = {}, units: Record<string, string> = {}
  for (const item of items.data ?? []) { quantities[item.product_id] = String(item.qty); units[item.product_id] = item.unit }
  return NextResponse.json({ restaurantId: restaurant.id, batch, businessDate: date, orderId: order.data?.id ?? null,
    quantities, units, products, today, minutes }, { headers: { 'Cache-Control': 'no-store' } })
}
