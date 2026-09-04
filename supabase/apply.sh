#!/usr/bin/env bash
#
# 스키마를 실제 Supabase 에 올린다.
#
#   npm run db:check           읽기만 한다 — 아무것도 안 고친다
#   npm run db:apply           확인을 묻고 적용한다
#   npm run db:apply -- --yes  묻지 않는다 (자동화용)
#
# ┌─ 이 DB 는 humanish 와 **같은 프로젝트**다 ───────────────────────────────┐
# │ 그래서 이 스크립트가 하는 일의 절반은 적용이 아니라 **울타리**다.        │
# │                                                                        │
# │   1. SQL 을 훑어 `public.` · drop schema · drop database · truncate 가   │
# │      있으면 **붙기도 전에** 거부한다                                     │
# │   2. search_path 를 wih 로 고정한다 — 스키마를 안 적은 이름은 전부       │
# │      wih 로 간다 (public 으로 새지 않는다)                              │
# │   3. 적용 **전에** public 의 표 목록을 떠 두고, 적용 **뒤에** 대조한다 — │
# │      한 글자라도 달라졌으면 남의 표를 건드린 것이다                      │
# │                                                                        │
# │ 셋 다 "실수해도 humanish 가 안 죽는다"를 위한 것이다. 값이 아니라        │
# │ 사고를 막는다 — 접속 문자열은 그 DB 전체에 대한 쓰기 권한이라서.        │
# └────────────────────────────────────────────────────────────────────────┘
#
# 접속 문자열은 SUPABASE_DB_URL_DIRECT 로 온다 (npm 스크립트가 tools/load-vars.mjs 로 넣어 준다).
# 이 값은 **런타임에 안 쓴다** — 워커에도, 브라우저에도 넣지 않는다. 마이그레이션 전용이다.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE=apply
case "${1:-}" in
  --yes)   MODE=yes ;;
  --check) MODE=check ;;
  "")      ;;
  *) echo "모르는 옵션: $1"; exit 1 ;;
esac

command -v psql >/dev/null || { echo "psql 이 없다.  brew install postgresql@16"; exit 1; }

# 올릴 파일. 새 SQL 을 만들면 **여기에도 반드시 더한다** —
# 목록에서 빠진 파일은 로컬에서만 돌고 배포 DB 에는 영영 안 올라간다.
FILES=(schema.sql)
TARGETS=()

# ── 0. 울타리: 남의 스키마를 건드리는 SQL 인가 ──────────────────────────────
# 붙기 전에 본다. 붙고 나서 보면 이미 늦을 수 있다.
# 규칙과 자가 점검은 fence.sh / fence.test.sh 에 있다 — 검사가 사는 곳은 한 군데다.
# shellcheck source=./fence.sh
. "$ROOT/supabase/fence.sh"
for f in "${FILES[@]}"; do TARGETS+=("$ROOT/supabase/$f"); done
fence_check "${TARGETS[@]}" || exit 1

# ── 1. 접속 문자열 ──────────────────────────────────────────────────────────
DB_URL="${SUPABASE_DB_URL_DIRECT:-}"
if [ -z "$DB_URL" ] || [[ "$DB_URL" == *PASSWORD* ]] || [[ "$DB_URL" == *xxxxxx* ]]; then
  cat <<'EOF'
SUPABASE_DB_URL_DIRECT 이 비어 있거나 예시값 그대로다.

  Supabase 대시보드 → Project Settings → Database → Connection string
  거기 문자열을 시크릿 파일의 SUPABASE_DB_URL_DIRECT 에 넣는다 (이름 목록은 .dev.vars.example).

  ★ 세 가지를 조심한다. 여기서 제일 많이 막힌다.
    1. SUPABASE_URL 과 **다른 값**이다. https:// 로 시작하는 주소를 여기 넣으면 안 된다.
    2. 복사하면 비밀번호 자리가 [YOUR-PASSWORD] 껍데기다. 프로젝트 만들 때 정한
       DB 비밀번호로 바꾼다. @ : / ? # 가 있으면 URL 인코딩한다 (@ → %40).
    3. "Direct connection" 은 IPv6 전용이라 국내 네트워크에서는 대개 안 붙는다.
       그때는 같은 화면의 "Session pooler" 를 쓴다 (포트는 5432 그대로).
       Transaction pooler(6543) 는 마이그레이션에 쓰지 않는다.
EOF
  exit 1
fi

# 로그에 비밀번호를 남기지 않는다
SAFE_URL="$(printf '%s' "$DB_URL" | sed -E 's#(//[^:]+:)[^@]+@#\1****@#')"
echo "▸ 대상: $SAFE_URL"
echo "  ※ 이 DB 는 humanish 와 공유다. 이 스크립트는 wih 스키마 밖으로 나가지 않는다."

if ! ERR="$(PGCONNECT_TIMEOUT=10 psql "$DB_URL" -tAqc 'select 1' 2>&1)"; then
  echo "  ✗ 접속 실패"
  echo ""
  if [[ "${DB_URL#postgresql://}" == *"://"* ]]; then
    echo "  주소 안에 http:// 나 https:// 가 들어 있다."
    echo "  Project URL(https://xxxx.supabase.co)을 접속 문자열 자리에 붙여넣은 경우다. 둘은 다른 값이다."
  elif [[ "$ERR" == *"could not translate host name"* ]]; then
    echo "  호스트 이름이 안 풀린다. 직결 주소(db.<ref>.supabase.co)는 IPv6 전용이라"
    echo "  IPv6 가 없는 네트워크에서는 이름조차 못 푼다. 비밀번호 문제가 아니다."
    echo "  → 대시보드 Database → Connection string 에서 \"Session pooler\" 를 고른다 (포트 5432)."
  elif [[ "$ERR" == *"password authentication failed"* ]]; then
    echo "  비밀번호가 틀렸다. 복사하면 [YOUR-PASSWORD] 껍데기가 들어 있다 — 실제 DB 비밀번호로 바꾼다."
  fi
  echo ""
  echo "  psql 원문: $(printf '%s' "$ERR" | sed -E 's#(//[^:]+:)[^@]+@#\1****@#' | head -2)"
  exit 1
fi
echo "  ✓ 접속됨 (Postgres $(psql "$DB_URL" -tAqc 'show server_version'))"

FAIL=0
q()     { psql "$DB_URL" -tAqc "$1" 2>&1 | head -1; }
check() { if [ "$2" = "$3" ]; then printf '  ✓ %s\n' "$1"; else printf '  ✗ %s\n      기대 %s\n      실제 %s\n' "$1" "$2" "$3"; FAIL=1; fi; }

# shellcheck source=./checks.sh
. "$ROOT/supabase/checks.sh"

# ── 2. 적용 ─────────────────────────────────────────────────────────────────
if [ "$MODE" != check ]; then
  # 남의 표 목록을 먼저 떠 둔다. 적용 뒤 대조가 이 값으로 돈다 (checks.sh)
  PUBLIC_BEFORE="$(public_tables)"
  export PUBLIC_BEFORE

  if [ "$MODE" = apply ]; then
    echo ""
    echo "  올릴 파일: ${FILES[*]}"
    read -r -p "  이 DB 의 wih 스키마에 적용한다. 계속? [y/N] " ans
    [ "$ans" = y ] || [ "$ans" = Y ] || { echo "취소했다."; exit 1; }
  fi

  echo ""
  for f in "${FILES[@]}"; do
    printf '  %-24s' "$f"
    # ★ search_path 에서 **public 을 뺀다.** 스키마를 안 적은 이름이 남의 칸으로 새지 않게 —
    #   울타리 0 번이 문법을 막는다면 이건 **기본값**을 막는다.
    #   extensions 는 남긴다: Supabase 는 pgcrypto 같은 것을 거기 둔다.
    if out="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -q \
                -c 'set search_path = wih, extensions, pg_catalog' -f "$ROOT/supabase/$f" 2>&1)"; then
      echo "✓"
      printf '%s\n' "$out" | grep -i 'WARNING' | sed 's/^/       ⚠ /' || true
    else
      echo "✗"; printf '%s\n' "$out" | tail -20; exit 1
    fi
  done
else
  # 읽기만 하는 모드에서도 3번 검사가 돌게 지금 목록을 기준값으로 삼는다 (늘 통과한다)
  PUBLIC_BEFORE="$(public_tables)"
fi

# ── 3. 점검 ─────────────────────────────────────────────────────────────────
echo ""
echo "── 점검 ──"
schema_checks

echo ""
if [ "$FAIL" -ne 0 ]; then
  echo "✗ 점검에서 걸렸다. 위 줄을 먼저 고친다."
  exit 1
fi
echo "✓ 이상 없다."
