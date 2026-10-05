-- SCM Smart — 미가공 재고 수정·종료 (2026-10-06) · 다시 실행해도 안전
-- 생산실적(result_no)의 미가공(미투입) 수량을 줄이거나(수정) 남은 수량을 마감(종료)한 기록
-- 미가공 재고 = 양품 − 가공투입 − Σqty   (수정은 되돌릴 때 qty 가 음수)
create table if not exists stock_adj (
  adj_no text primary key,
  adj_type text not null default '수정',   -- 수정 / 종료
  result_no text not null, item_cd text,
  qty numeric not null,                   -- 미가공 재고에서 빼는 수량
  reason text,
  created_at timestamptz default now(), created_by text);
create index if not exists stock_adj_result on stock_adj(result_no);
alter table stock_adj enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='stock_adj' and policyname='auth_all') then
    create policy auth_all on stock_adj for all to anon, authenticated using (true) with check (true); end if;
end $$;
grant select, insert, update, delete on stock_adj to anon, authenticated;
-- 확인
select count(*) as stock_adj_rows from stock_adj;
