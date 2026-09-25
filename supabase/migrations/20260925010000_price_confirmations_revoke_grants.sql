-- price_confirmations 는 서버(service role)만 읽고 쓴다. Supabase 가 새 표에 기본으로 주는
-- anon·authenticated 권한(TRUNCATE 포함)을 회수한다. RLS 가 읽기·쓰기는 이미 막고 있지만
-- RLS 는 TRUNCATE 를 막지 못한다 — 뷰(price_day_last_change)와 같은 상태로 맞춘다.
revoke all on public.price_confirmations from anon, authenticated;
