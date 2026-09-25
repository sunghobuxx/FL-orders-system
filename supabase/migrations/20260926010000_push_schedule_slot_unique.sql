-- savePushSchedule uses ON CONFLICT (slot). Preserve every existing schedule.
-- Duplicate slots deliberately abort this migration; do not delete customer settings.
begin;
set local lock_timeout = '5s';
create unique index if not exists push_schedules_slot_unique on public.push_schedules (slot);
commit;
