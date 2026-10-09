-- SCM Smart — 생산실적 사용 소재로트별 양품·불량 (2026-10-09) · 다시 실행해도 안전
-- 실적의 양품수량·불량수량 = 소재로트별 양품·불량의 합
alter table prod_result_lot add column if not exists good_qty numeric;
alter table prod_result_lot add column if not exists ng_qty numeric;
