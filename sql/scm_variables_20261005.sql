-- SCM Smart — 사내외가공 변수 기준 (2026-10-05) · 다시 실행해도 안전
-- B·C 불량 원인/처리, H 사내 실적(설비·작업시간)
alter table lot_move add column if not exists ng_cause  text;          -- 가공 / 소재 / 취급 / 분실 (미입고마감)
alter table lot_move add column if not exists ng_action text;          -- 재작업 / 폐기 / 반품
alter table lot_move add column if not exists equip     text;          -- 사내 설비 (자유 입력)
alter table lot_move add column if not exists work_start timestamptz;  -- 사내 작업 시작
alter table lot_move add column if not exists work_end   timestamptz;  -- 사내 작업 종료
-- E 로트 분할
alter table lot_process add column if not exists split_qty numeric;    -- 이 공정 양품 중 분할로 떼어 간 수량
alter table prod_lot    add column if not exists split_from text;      -- 분할 원 로트

-- F 사내 첫 투입 이동기록 보정: 사내 공정 발주수량 중 이동기록(사내투입·반출)이 없는 만큼 '사내투입' 기록 생성
insert into lot_move (move_no,lot_no,proc_id,move_type,from_site,to_site,move_qty,move_date,worker,scan_method,seq,remark,created_at,created_by,updated_at,updated_by)
select 'MV-FIX-'||p.proc_id, p.lot_no, p.proc_id, '사내투입', p.site_cd, p.site_cd,
       p.out_qty - coalesce(m.q,0), coalesce(p.out_date,current_date), coalesce(p.updated_by,'관리자'), '수동', p.seq,
       '사내 첫 투입 이동기록 보정(2026-10-05)', now(), 'system', now(), 'system'
from lot_process p
left join (select proc_id, sum(move_qty) q from lot_move where move_type in ('사내투입','반출') group by proc_id) m on m.proc_id=p.proc_id
where p.inout_type='사내' and p.status<>'대기' and coalesce(p.out_qty,0) - coalesce(m.q,0) > 0
on conflict (move_no) do nothing;

-- 확인
select column_name, table_name from information_schema.columns
 where table_schema='public' and ((table_name='lot_move' and column_name in ('ng_cause','ng_action','equip','work_start','work_end'))
   or (table_name='lot_process' and column_name='split_qty') or (table_name='prod_lot' and column_name='split_from'));
select move_no, lot_no, move_qty from lot_move where move_no like 'MV-FIX-%';
