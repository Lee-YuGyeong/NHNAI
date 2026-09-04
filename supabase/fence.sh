#!/usr/bin/env bash
#
# 울타리 — 이 저장소의 SQL 이 **남의 스키마를 건드리지 않는가**.
#
# 이 DB 는 humanish 와 같은 프로젝트다. 접속 문자열은 그 DB 전체에 대한 쓰기 권한이라,
# 여기서 실수하면 이쪽 기능이 아니라 **그쪽 게임이 죽는다.** 그래서 이 검사는 DB 에
# 붙기도 전에 돈다 — 붙고 나서 보면 이미 늦을 수 있다.
#
# apply.sh 가 읽어 들여 `fence_check <파일…>` 로 부른다.
# 자가 점검: bash supabase/fence.test.sh   (DB 없이 돈다)

# 막는 것 — 넷 다 "돌고 나서야 알게 되는" 종류다
#   public.        남의 표를 직접 가리킨다
#   drop schema    스키마 통째로
#   drop database  말할 것도 없다
#   truncate       남의 표를 비운다. drop 보다 조용해서 더 나쁘다
#   alter default privileges  다음에 만들어질 표의 권한까지 바꾼다 — 범위가 이 저장소를 넘는다
FENCE_BANNED='(^|[^a-z_])public\.|drop[[:space:]]+schema|drop[[:space:]]+database|(^|[^a-z_])truncate([^a-z_]|$)|alter[[:space:]]+default[[:space:]]+privileges'

# 주석(-- …)은 검사에서 뺀다. 설명하려고 public 을 적는 것까지 막으면
# 정작 "왜 안 되는지" 를 파일에 못 쓴다.
fence_body() { sed -E 's/--.*$//' "$1"; }

# 0 = 통과, 1 = 걸림 (걸린 줄을 stdout 에 찍는다)
fence_check() {
  local f body hit rc=0
  for f in "$@"; do
    body="$(fence_body "$f")"
    if hit="$(printf '%s' "$body" | grep -inE "$FENCE_BANNED")"; then
      echo "✗ $(basename "$f") 에 이 저장소가 건드리면 안 되는 것이 들어 있다:"
      printf '%s\n' "$hit" | sed 's/^/    /'
      rc=1
    fi
  done
  if [ "$rc" -ne 0 ]; then
    echo ""
    echo "  이 DB 는 humanish 와 공유다. public 스키마 · drop schema · truncate 는 여기서 안 한다."
    echo "  표를 만들려면 이름 앞에 스키마를 안 적으면 된다 — search_path 가 wih 로 잡혀 있다."
  fi
  return "$rc"
}
