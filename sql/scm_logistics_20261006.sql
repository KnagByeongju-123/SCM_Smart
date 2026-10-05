-- SCM Smart — 물류 이동 (2026-10-06) · 다시 실행해도 안전
-- 1 분할 출고: 발주수량(out_qty)과 실제 출고 누계(ship_qty) 분리
alter table lot_process add column if not exists ship_qty numeric;
update lot_process set ship_qty=out_qty where status<>'대기' and ship_qty is null and out_qty is not null;
-- 3 협력사 수령확인: 수령확인 이동기록이 어느 출고건(move_no)에 대한 것인지
alter table lot_move add column if not exists ref_move text;
