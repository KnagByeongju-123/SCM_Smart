-- SCM Smart — 기존 실적의 호기 값 정리 (2026-10-09) · 다시 실행해도 안전
-- 숫자만 저장된 호기('2','3')를 설비호기 이름('2호기','3호기')으로 바꿈
update prod_result set machine_no = machine_no || '호기' where machine_no ~ '^[0-9]+$';
