-- 포장 규격: kg 로 들어온 발주를 포장 단위로 되돌리기 위한 값.
--
-- 일산킨텍스가 2026-09-07 에 양파 1포를 "15kg" 으로 발주했다. 시스템은 그것을
-- "24,000원짜리 15개" 로 읽어 360,000원을 청구했다(정상 24,000).
-- 규격을 알면 발주 화면과 명세서 양쪽에서 1포로 되돌릴 수 있다.
alter table products
  add column if not exists pack_unit text,
  add column if not exists kg_per_pack numeric;

comment on column products.pack_unit is '포장 단위 (bag/box 등). kg 발주를 이 단위로 되돌린다';
comment on column products.kg_per_pack is '포장 하나가 몇 kg 인지. 양파 1포=15, 청양고추 1박스=10';

alter table products drop constraint if exists products_pack_unit_check;
alter table products add constraint products_pack_unit_check
  check (pack_unit is null or pack_unit in ('ea','box','kg','g','pack','bag','bottle'));

alter table products drop constraint if exists products_kg_per_pack_check;
alter table products add constraint products_kg_per_pack_check
  check (kg_per_pack is null or kg_per_pack > 0);

update products set pack_unit = 'bag', kg_per_pack = 15 where standard_name = '양파';
update products set pack_unit = 'box', kg_per_pack = 10 where standard_name = '청양고추';

-- 청양고추B 도 10kg 이 1박스지만 **박스 단가가 없어** 규격을 비워 둔다.
-- 규격만 넣으면 10kg 발주가 1박스로 바뀌면서 0원으로 청구된다
-- (단위가 둘 이상인 품목은 그 단위 단가가 없을 때 다른 단위로 폴백하지 않는다).
-- 박스 단가를 등록한 뒤 품목마스터에서 켜면 된다.
