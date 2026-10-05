-- SCM Smart — 물류 이동 (2026-10-06) · 다시 실행해도 안전
-- 1 분할 출고: 발주수량(out_qty)과 실제 출고 누계(ship_qty) 분리
alter table lot_process add column if not exists ship_qty numeric;
update lot_process set ship_qty=out_qty where status<>'대기' and ship_qty is null and out_qty is not null;
-- 3 협력사 수령확인: 수령확인 이동기록이 어느 출고건(move_no)에 대한 것인지
alter table lot_move add column if not exists ref_move text;

-- 4 고객 출하 · 고객 반품
create table if not exists scm_customer (
  cust_cd text primary key, cust_nm text not null, use_yn boolean default true, remark text,
  created_at timestamptz default now(), created_by text, updated_at timestamptz default now(), updated_by text);
create table if not exists lot_ship (
  ship_no text primary key, ship_type text not null default '출하',   -- 출하 / 반품
  ship_date date not null default current_date,
  cust_cd text, lot_no text not null, item_cd text, qty numeric not null,
  restock boolean,      -- 반품: 가공완료재고로 되돌림 여부
  reason text, ref_ship text, worker text, remark text,
  created_at timestamptz default now(), created_by text, updated_at timestamptz default now(), updated_by text);
create index if not exists lot_ship_lot on lot_ship(lot_no);
alter table scm_customer enable row level security;
alter table lot_ship enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='scm_customer' and policyname='auth_all') then
    create policy auth_all on scm_customer for all to anon, authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='lot_ship' and policyname='auth_all') then
    create policy auth_all on lot_ship for all to anon, authenticated using (true) with check (true); end if;
end $$;
grant select, insert, update, delete on scm_customer, lot_ship to anon, authenticated;
