-- 업체 주소·사업자등록증 파일. 식당·공급처 공용이라 organizations 에 둔다
-- (biz_no 는 restaurants 전용이지만, 가락시장 같은 공급처도 주소가 필요해서 여기엔 안 맞는다).
-- 2026-10-02 가락시장 매입 시작 — 서울 식당 판별에 주소가 필요해 추가.

alter table public.organizations add column if not exists address text;
-- storage 객체 경로(퍼블릭 URL 아님). 사업자등록증은 민감한 서류라 비공개 버킷에 두고
-- 열람은 그때그때 서명된 URL로만 한다(공지 첨부파일과 다른 점).
alter table public.organizations add column if not exists biz_license_path text;
