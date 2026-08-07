-- 스토리지 버킷을 만든다.
--
-- 버킷이 **하나도 없어서** 파일 업로드가 전부 죽어 있었다.
--   공지 첨부      admin/notices/NoticeFileInput.tsx  (브라우저에서 직접)
--   회원 문의 사진  api/member/inquiries               (서버, service role)
--   상품 이미지     api/admin/products/image           (서버, service role)
-- 2026-07 Mumbai→Seoul 이관 때 테이블 52개는 옮겼는데 스토리지는 빠졌다.
-- 그래서 "오류가 발생했습니다" 만 뜨고 원인을 못 찾고 있었다(2026-07-20 부터).
--
-- 둘 다 공개 버킷이다. 공지 첨부와 상품 이미지는 회원 화면에 그대로 노출되고
-- 코드가 getPublicUrl 로 주소를 만든다.

-- ★ 여기 값만으로는 안 된다. 프로젝트 전역 업로드 한도가 따로 있고 둘 중 **작은 쪽**이 이긴다.
--   전역 한도는 SQL 로 못 바꾼다. 대시보드에서만 된다:
--   Settings → Storage → Upload file size limit
--   2026-08-08 측정: 전역이 50MB 라 버킷을 100MB 로 올려도 51MB 부터 막혔다.
--   (50MB 성공 / 51MB "The object exceeded the maximum allowed size")
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('notices',        'notices',        true, 104857600),  -- 100MB. 전역도 100MB 로 올려야 실제로 먹는다
  ('product-images', 'product-images', true, 10485760)    -- 10MB
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "storage_public_read" on storage.objects;
create policy "storage_public_read"
  on storage.objects for select to anon, authenticated
  using (bucket_id in ('notices', 'product-images'));

-- 공지 첨부만 브라우저에서 직접 올린다. 나머지 둘은 service role 이라 RLS 를 지나지 않는다.
--
-- 로그인만 하면 올릴 수 있게 두면 안 된다. 식당 회원도 로그인 사용자다.
-- lib/admin-notices.ts 의 hasNoticeAdminAccess 와 같은 규칙으로 좁힌다.
drop policy if exists "notices_admin_write" on storage.objects;
create policy "notices_admin_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'notices'
    and exists (
      select 1 from public.memberships m
      left join public.organizations o on o.id = m.organization_id
      where m.user_id = auth.uid()
        and (m.role in ('admin', 'manager')
             or o.organization_type in ('platform', 'operator'))
    )
  );

drop policy if exists "notices_admin_delete" on storage.objects;
create policy "notices_admin_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'notices'
    and exists (
      select 1 from public.memberships m
      left join public.organizations o on o.id = m.organization_id
      where m.user_id = auth.uid()
        and (m.role in ('admin', 'manager')
             or o.organization_type in ('platform', 'operator'))
    )
  );
