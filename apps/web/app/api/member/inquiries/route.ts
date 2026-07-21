export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

const MAX_FILES = 5
const MAX_FILE_SIZE = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  const { user, supabase } = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership?.organization_id) {
    return NextResponse.json({ error: '업체 정보를 확인할 수 없습니다.' }, { status: 403 })
  }

  let title = ''
  let content = ''
  let files: File[] = []
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    title = String(form.get('title') ?? '').trim()
    content = String(form.get('content') ?? '').trim()
    files = form.getAll('images').filter((value): value is File => value instanceof File && value.size > 0)
  } else {
    const body = await req.json() as { title?: string; content?: string }
    title = body.title?.trim() ?? ''
    content = body.content?.trim() ?? ''
  }

  if (!title || !content) {
    return NextResponse.json({ error: '제목과 내용을 입력해주세요.' }, { status: 400 })
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `이미지는 최대 ${MAX_FILES}개까지 첨부할 수 있습니다.` }, { status: 400 })
  }
  const invalidFile = files.find(file => !file.type.startsWith('image/') || file.size > MAX_FILE_SIZE)
  if (invalidFile) {
    return NextResponse.json({ error: '첨부파일은 10MB 이하의 이미지만 가능합니다.' }, { status: 400 })
  }

  const db = createAdminClient()
  const imagePaths: string[] = []
  const uploadedPaths: string[] = []

  for (const file of files) {
    const safeExt = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const path = `inquiries/${membership.organization_id}/${crypto.randomUUID()}.${safeExt}`
    const { error: uploadError } = await db.storage.from('notices').upload(path, file, {
      contentType: file.type,
      upsert: false,
    })
    if (uploadError) {
      if (uploadedPaths.length > 0) await db.storage.from('notices').remove(uploadedPaths)
      return NextResponse.json({ error: `파일 업로드 실패: ${uploadError.message}` }, { status: 500 })
    }
    uploadedPaths.push(path)
    imagePaths.push(db.storage.from('notices').getPublicUrl(path).data.publicUrl)
  }

  const { error: insertError } = await db.from('inquiries').insert({
    organization_id: membership.organization_id,
    user_id: user.id,
    category: 'inquiry',
    status: 'open',
    title,
    content,
    image_paths: imagePaths,
  })

  if (insertError) {
    if (uploadedPaths.length > 0) await db.storage.from('notices').remove(uploadedPaths)
    return NextResponse.json({ error: `문의 등록 실패: ${insertError.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
