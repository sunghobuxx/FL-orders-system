-- restaurants.ceo_name 되돌림. 회원 수정 화면에 이미 "대표자" 입력칸이 있고(contacts.name, is_primary=true),
-- 61곳 중 59곳에 이미 채워져 있다 — 세금계산서 공급받는자 대표자성명은 이 값을 그대로 쓰면 된다.
-- 별도 컬럼을 만든 건 중복이었다(2026-09-29 마이그레이션 20260929030000 에서 추가했다가 바로 되돌림).
-- 데이터는 없었다(방금 추가한 컬럼, 전부 NULL) — 되돌려도 잃는 게 없다.

alter table public.restaurants drop column if exists ceo_name;
