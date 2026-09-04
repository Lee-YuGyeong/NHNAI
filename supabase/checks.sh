#!/usr/bin/env bash
#
# 적용 뒤 점검 — apply.sh 가 읽어 들여 부른다 (`. checks.sh` → `schema_checks`).
#
# ★ 검사를 apply.sh 에 직접 적지 않는다. humanish 는 한쪽에만 있는 검사 때문에
#   "로컬은 초록불인데 배포만 죽는" 사고를 두 번 냈다. 검사가 사는 곳은 이 파일 하나다.
#
# 여기서 보는 것은 셋이다. 셋 다 **틀리면 조용한** 종류라서 검사가 유일한 방어선이다:
#   1. wih 스키마가 있나
#   2. wih 의 모든 표에 RLS 가 켜져 있나  ← 안 켜지면 anon 키로 전 세계가 읽는다
#   3. public(=humanish) 이 그대로인가    ← 우리가 남의 표를 건드렸으면 여기서 걸린다
#
# 부르는 쪽이 정의해 두는 것: q() 질의, check() 대조, $DB_URL, $FAIL

schema_checks() {
  # 1. 스키마
  check "wih 스키마" "1" "$(q "select count(*) from information_schema.schemata where schema_name='wih'")"

  # 2. RLS — 켜지지 않은 표 이름을 그대로 보여 준다 (개수만 세면 무엇인지 몰라 못 고친다)
  local naked
  naked="$(q "select coalesce(string_agg(relname, ', ' order by relname), '없음')
              from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname='wih' and c.relkind='r' and not c.relrowsecurity")"
  check "wih 의 모든 표에 RLS" "없음" "$naked"

  # 3. 남의 스키마 — apply.sh 가 적용 **전에** 떠 놓은 목록과 대조한다.
  #    같지 않으면 우리가 humanish 의 표를 만들었거나 지웠다는 뜻이다.
  if [ -n "${PUBLIC_BEFORE:-}" ]; then
    check "humanish(public) 그대로" "$PUBLIC_BEFORE" "$(public_tables)"
  fi
}

# public 스키마의 표 목록 (알파벳순 한 줄). 대조용이라 모양이 늘 같아야 한다
public_tables() {
  q "select coalesce(string_agg(tablename, ',' order by tablename), '(비어 있음)')
     from pg_tables where schemaname='public'"
}
