-- 발주 문자 3분류: existing(기존 공급처) / common(공통업체, 전 지역 주문을 한 통으로) / garak(가락업체, 가락 매입 품목 문자)
alter table public.suppliers add column if not exists dispatch_group text not null default 'existing';

alter table public.suppliers drop constraint if exists suppliers_dispatch_group_check;
alter table public.suppliers add constraint suppliers_dispatch_group_check
  check (dispatch_group in ('existing', 'common', 'garak'));

update public.suppliers s
   set dispatch_group = 'common'
  from public.organizations o
 where o.id = s.organization_id and o.name = '인천콩나물';
