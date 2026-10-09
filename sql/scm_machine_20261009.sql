-- SCM Smart — 설비호기 기준정보 (2026-10-09) · 다시 실행해도 안전
-- 생산기준정보 > 설비호기 화면. 생산실적등록의 호기 드롭다운이 이 표를 읽는다.
create table if not exists scm_machine (
  machine_cd text primary key, machine_nm text not null, use_yn boolean default true, remark text,
  created_at timestamptz default now(), created_by text, updated_at timestamptz default now(), updated_by text);
alter table scm_machine enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='scm_machine' and policyname='auth_all') then
    create policy auth_all on scm_machine for all to anon, authenticated using (true) with check (true); end if;
end $$;
-- 기본 자료: 1호기 ~ 10호기
insert into scm_machine (machine_cd, machine_nm, created_by, updated_by)
select 'M'||lpad(g::text,2,'0'), g||'호기', 'system', 'system' from generate_series(1,10) g
on conflict (machine_cd) do nothing;
