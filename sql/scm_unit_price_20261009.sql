-- SCM Smart — 공정별 가공 단가 (2026-10-09) · 다시 실행해도 안전
-- 사내외가공진행 > 선택 처리 창에서 발주·입고 때 넣는 단가
alter table lot_process add column if not exists unit_price numeric;
