#!/usr/bin/env bash
#
# 울타리 자가 점검 — DB 없이 돈다.  bash supabase/fence.test.sh
#
# 이 검사가 통과하지 못하면 `npm run db:apply` 를 쓰면 안 된다.
# 여기서 지키는 것은 하나다: **이 저장소의 SQL 이 humanish 를 못 건드린다.**

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=./fence.sh
. "$ROOT/supabase/fence.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0
FAIL=0

# $1 기대(reject|accept)  $2 이름  $3 SQL
t() {
  printf '%s\n' "$3" > "$TMP/t.sql"
  if fence_check "$TMP/t.sql" >/dev/null 2>&1; then got=accept; else got=reject; fi
  if [ "$got" = "$1" ]; then
    PASS=$((PASS + 1)); printf '  ✓ %s\n' "$2"
  else
    FAIL=$((FAIL + 1)); printf '  ✗ %s  (기대 %s / 실제 %s)\n' "$2" "$1" "$got"
  fi
}

echo "── 막아야 하는 것 ──"
t reject 'public. 로 남의 표를 가리킨다'      'select * from public.profiles;'
t reject 'public 에 표를 만든다'              'create table public.rooms (id int);'
t reject '대문자로 써도 같다'                 'SELECT * FROM PUBLIC.PROFILES;'
t reject 'drop schema'                        'drop schema wih cascade;'
t reject 'drop   schema (공백 여러 개)'       'drop    schema  public;'
t reject 'drop database'                      'drop database postgres;'
t reject 'truncate'                           'truncate rooms;'
t reject 'alter default privileges'           'alter default privileges grant select on tables to anon;'
t reject '여러 줄 중 한 줄만 나빠도'          $'create table foo (id int);\nselect * from public.votes;'

echo ""
echo "── 통과해야 하는 것 ──"
t accept '스키마 안 적은 create table'        'create table if not exists foo (id uuid primary key);'
t accept 'wih. 로 명시한 것'                  'select * from wih.foo;'
t accept 'auth.users 참조 (계정은 공유다)'    'create table foo (user_id uuid references auth.users(id));'
t accept 'RLS 켜기'                           'alter table foo enable row level security;'
t accept '정책 만들기'                        $'drop policy if exists p on foo;\ncreate policy p on foo for select to authenticated using (user_id = auth.uid());'
t accept '주석에 적힌 public 은 설명이다'     '-- public.rooms 는 humanish 것이라 안 건드린다'
t accept '주석에 적힌 truncate'               '-- truncate 는 이 저장소에서 쓰지 않는다'
t accept 'public_room 처럼 이름의 일부'       'create table public_room_notes (id int);'
t accept '빈 파일'                            ''

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "✓ $PASS 개 전부 통과"
else
  echo "✗ $FAIL 개 실패 / $PASS 개 통과"
  exit 1
fi
