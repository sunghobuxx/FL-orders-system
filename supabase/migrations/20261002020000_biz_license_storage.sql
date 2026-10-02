-- 사업자등록증 저장용 비공개 버킷. 공지(notices)와 달리 공개 읽기를 안 연다 —
-- 서류 자체가 사업자번호·주소 등 민감정보라 URL 을 안다고 아무나 보면 안 된다.
-- 열람은 어드민이 그때그때 서명된 URL(createSignedUrl)로만 한다.

insert into storage.buckets (id, name, public)
values ('biz-licenses', 'biz-licenses', false)
on conflict (id) do nothing;

create policy biz_licenses_admin_write on storage.objects for insert
  with check (
    bucket_id = 'biz-licenses' and exists (
      select 1 from memberships m left join organizations o on o.id = m.organization_id
      where m.user_id = auth.uid()
        and (m.role in ('admin', 'manager') or o.organization_type in ('platform', 'operator'))
    )
  );

create policy biz_licenses_admin_read on storage.objects for select
  using (
    bucket_id = 'biz-licenses' and exists (
      select 1 from memberships m left join organizations o on o.id = m.organization_id
      where m.user_id = auth.uid()
        and (m.role in ('admin', 'manager') or o.organization_type in ('platform', 'operator'))
    )
  );

create policy biz_licenses_admin_delete on storage.objects for delete
  using (
    bucket_id = 'biz-licenses' and exists (
      select 1 from memberships m left join organizations o on o.id = m.organization_id
      where m.user_id = auth.uid()
        and (m.role in ('admin', 'manager') or o.organization_type in ('platform', 'operator'))
    )
  );
