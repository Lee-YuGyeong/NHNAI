#!/usr/bin/env sh
# 맵 GLB 부품을 **Tripo Studio 크레딧**으로 자동 생성한다 — 공식 CLI(@tripo3d/cli, Studio 계정 세션)를 쓴다.
#   tools/tripo-parts.mjs 는 API 지갑(tsk_ 키·종량제)을, 이 스크립트는 Studio 지갑(월 구독 크레딧)을 쓴다. 지갑이 다르다.
#
#   sh tools/tripo-studio-parts.sh <parts.json> <원본 폴더> [--reduce tools/xxx-glb.sh] [id ...]
#     parts.json 은 tripo-parts.mjs 와 같은 [{ id, prompt }]. 결과는 <원본 폴더>/<id>.glb (원본, 수십 MB).
#     이미 있는 <id>.glb 는 건너뛴다 (크레딧 보호). --reduce 를 주면 경량화 스크립트로 public/world/… 에 넣는다.
#
#   로그인(한 번만, 대화형 — 이메일로 온 코드를 넣는다):  npx @tripo3d/cli auth login --email <Studio 계정 이메일>
#   잔액:                                                  npx @tripo3d/cli account balance
#   세션은 CLI 설정 파일에만 저장되고 이 저장소에는 아무것도 남지 않는다.
#
# 부품 셋은 나란히 돌린다 (Studio 는 동시 태스크를 받아준다). 한 부품 ≈ 25~30 크레딧.
set -eu
PARTS="${1:?parts.json}"; OUT="${2:?원본 폴더}"; shift 2
REDUCE=""
if [ "${1:-}" = "--reduce" ]; then REDUCE="$2"; shift 2; fi
ONLY="$*"
TRIPO="${TRIPO_CLI:-npx --yes @tripo3d/cli}"
mkdir -p "$OUT"

$TRIPO auth whoami >/dev/null 2>&1 || { echo "Studio 로그인이 없다: npx @tripo3d/cli auth login --email <이메일>" >&2; exit 3; }
$TRIPO account balance

DONE=""
node -e '
  const parts = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  for (const p of parts) console.log(p.id + "\t" + p.prompt.replace(/\t/g, " "));
' "$PARTS" | while IFS="$(printf '\t')" read -r id prompt; do
  if [ -n "$ONLY" ] && ! echo " $ONLY " | grep -q " $id "; then continue; fi
  if [ -f "$OUT/$id.glb" ]; then echo "건너뜀 (이미 있음): $id"; continue; fi
  echo "생성: $id"
  $TRIPO generate text "$prompt" --pbr --wait -o "$OUT/$id.glb" --output-format json --timeout 20m > "$OUT/$id.log" 2>&1 && echo "저장: $OUT/$id.glb" || echo "실패: $id (로그 $OUT/$id.log)" &
  while [ "$(jobs -r | wc -l)" -ge 3 ]; do sleep 2; done
done
wait

if [ -n "$REDUCE" ]; then
  for f in "$OUT"/*.glb; do DONE="$DONE $(basename "$f" .glb)"; done
  echo "경량화: sh $REDUCE $OUT$DONE"
  sh "$REDUCE" "$OUT" $DONE
fi
echo DONE
