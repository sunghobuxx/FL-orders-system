export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file') as File | null
    const productId = form.get('productId') as string | null

    if (!file || !productId) return NextResponse.json({ error: '파일 또는 productId 누락' }, { status: 400 })

    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `products/${productId}.${ext}`
    const bytes = await file.arrayBuffer()

    const db = createAdminClient()
    const { error: uploadError } = await db.storage
      .from('product-images')
      .upload(path, bytes, { contentType: file.type, upsert: true })

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

    const { data: { publicUrl } } = db.storage.from('product-images').getPublicUrl(path)

    const { error: updateError } = await db.from('products').update({ image_path: publicUrl }).eq('id', productId)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    return NextResponse.json({ url: publicUrl })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '오류' }, { status: 500 })
  }
}
