-- 발주 문자에 업체별 수량을 붙일지 공급처마다 고른다.
--
-- 지금 문자는 줄마다 `양파: 20kg (고강점 3kg / 정왕점 2kg / …)` 로 업체별 수량이 붙는다.
-- 인숙이네처럼 품목도 업체도 많은 공급처는 줄이 너무 길어 받아 적기 어렵다는 피드백이 있었다
-- (2026-09-15). 기본은 켜짐 — 다른 공급처 문자는 그대로다.
alter table suppliers
  add column if not exists dispatch_show_breakdown boolean not null default true;

comment on column suppliers.dispatch_show_breakdown is
  '발주 문자에 업체별 수량 표시. false 면 품목별 총합만 보낸다';

update suppliers set dispatch_show_breakdown = false
where organization_id = (select id from organizations where name = '인숙이네' and organization_type = 'supplier');
