-- 발주 문자의 종류를 구분한다.
--   dispatch   02:30 자동발송, 확정 발송, 정정 재발송
--   additional 02:30 이후 들어온 발주만 따로 보낸 추가발주
--
-- 추가발주는 하루 한 번만 보낸다. 이 값으로 "오늘 이미 보냈는지" 를 판정한다.
alter table public.dispatch_messages
  add column if not exists message_type text not null default 'dispatch';

alter table public.dispatch_messages
  drop constraint if exists dispatch_messages_message_type_check;

alter table public.dispatch_messages
  add constraint dispatch_messages_message_type_check
  check (message_type in ('dispatch', 'additional'));

create index if not exists dispatch_messages_job_type_idx
  on public.dispatch_messages (dispatch_job_id, message_type);
