-- inquiries.category 제약이 코드가 쓰는 값을 막고 있어 등록이 항상 실패했다.
--
--   work_note  배송 중 전달 사항 (lib/driver-api.ts 의 DRIVER_NOTE_CATEGORY)
--   inquiry    회원 문의 (api/member/inquiries) — 2026-07-22 aeb7d0a 이후 계속 실패
--
-- 둘 다 제약에 없던 값이다. 기능을 만들면서 제약을 넓히지 않았고,
-- 관련 마이그레이션도 저장소에 없었다.
-- 거르는 쪽은 work_note 제외 여부만 보므로 값을 늘려도 화면 동작은 그대로다.
alter table public.inquiries drop constraint if exists inquiries_category_check;

alter table public.inquiries add constraint inquiries_category_check
  check (category = any (array[
    'order', 'settlement', 'product', 'system', 'etc', 'inquiry', 'work_note'
  ]));

notify pgrst, 'reload schema';
