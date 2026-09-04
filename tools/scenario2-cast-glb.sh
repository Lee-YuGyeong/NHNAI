#!/usr/bin/env sh
# 시나리오 2 의 개체 열 GLB 를 웹용으로 줄인다 (warehouse-glb.sh 와 같은 파이프라인).
#   원본: Tripo **Studio** text-to-model — tools/tripo-studio-parts.sh 로 뽑는다 (한 몸 ≈ 30 크레딧, 40MB 안팎)
#   결과: public/world/cast2/<id>.glb — 삼각형 감소 · 텍스처 축소 · EXT_meshopt_compression
#
#   1) 뽑기:   sh tools/tripo-studio-parts.sh tools/scenario2-cast-parts.json <원본 폴더> [id ...]
#   2) 줄이기: sh tools/scenario2-cast-glb.sh <원본 폴더> [id ...]
#
# ★ 지갑이 둘이다 (tripo-studio-parts.sh 머리말): `tripo-cli`(tsk_ 키)는 **API 지갑**, `@tripo3d/cli` 는
#   **Studio 지갑**(월 구독)이다. 이 저장소의 모델은 전부 Studio 지갑으로 뽑았다 — API 쪽 잔액은 0 이다.
#
# ★ 삼각형 예산: 한 방에 개체가 넷~여섯 서 있고 전부 **가만히 서 있기만** 한다. 리깅도 클립도 없다
#   (걸어가는 하나만 기존 리깅 아바타 robot.glb 를 쓴다 — features/world2/Unit.tsx).
#   그래서 몸 하나에 12k 면 충분하다: 여섯이 서 있어도 72k 로, 방을 세우는 값(수백 k)에 비하면 작다.
#   얼굴판의 금·수선 자국은 **텍스처**로 읽혀야 하므로 텍스처는 1024 로 넉넉히 남긴다.
set -eu
SRC_DIR="${1:?원본 폴더}"
shift
# --anim 이면 <id>_anim.glb (뼈 + 걸음 클립) 를 줄인다 — tools/scenario2-cast-rig.sh 로 뼈를 받고 tools/cast-anim-synth.mjs synth 로 클립을 갈아 끼운 결과다 (2026-09-03)
SUFFIX=""
if [ "${1:-}" = "--anim" ]; then SUFFIX="_anim"; shift; fi
ONLY="$*"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/world/cast2"
GLTF="${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli}"
mkdir -p "$OUT_DIR"

# id | 목표 삼각형 수(k) | 텍스처 한 변(px) | simplify 오차
# 리더만 크고 각져서 조금 더 준다 — 군중 속에서 못 숨는 것이 그 개체의 전부라 실루엣이 뭉개지면 안 된다.
TABLE='
s2_u104|12|1024|0.002
s2_u089|12|1024|0.002
s2_u012|12|1024|0.002
s2_u201|12|1024|0.002
s2_u063|12|1024|0.002
s2_u118|12|1024|0.002
s2_u137|12|1024|0.002
s2_guard21|14|1024|0.002
s2_seer|12|1024|0.002
s2_leader|18|1024|0.002
'

convert() {
  en="$1"; ktri="$2"; tex="$3"; err="$4"
  src="$SRC_DIR/$en$SUFFIX.glb"; out="$OUT_DIR/$en.glb"; tmp="$(mktemp -d)"
  [ -f "$src" ] || { echo "[$en] 원본이 없다 ($src)"; return 0; }
  tri=$(node -e '
    const fs=require("fs");const fd=fs.openSync(process.argv[1],"r");const h=Buffer.alloc(20);fs.readSync(fd,h,0,20,0);
    const len=h.readUInt32LE(12);const b=Buffer.alloc(len);fs.readSync(fd,b,0,len,20);const j=JSON.parse(b.toString());
    let t=0;for(const m of j.meshes)for(const p of m.primitives)t+=(p.indices!==undefined?j.accessors[p.indices].count:j.accessors[p.attributes.POSITION].count)/3;
    console.log(Math.round(t));' "$src")
  ratio=$(node -e "console.log(Math.min(1, ($ktri*1000)/$tri).toFixed(5))")
  echo "[$en] tri=$tri → ratio=$ratio  tex=${tex}²  err=$err"
  $GLTF weld "$src" "$tmp/a.glb" >/dev/null
  $GLTF simplify --ratio "$ratio" --error "$err" "$tmp/a.glb" "$tmp/b.glb" >/dev/null
  $GLTF resize --width "$tex" --height "$tex" "$tmp/b.glb" "$tmp/c.glb" >/dev/null
  $GLTF meshopt --level medium "$tmp/c.glb" "$out" >/dev/null
  rm -rf "$tmp"
  ls -la "$out"
}

echo "$TABLE" | grep -v '^$' | { while IFS='|' read -r en ktri tex err; do
  if [ -n "$ONLY" ] && ! echo " $ONLY " | grep -q " $en "; then continue; fi
  convert "$en" "$ktri" "$tex" "$err" &
  while [ "$(jobs -r | wc -l)" -ge 3 ]; do sleep 1; done
done; wait; }   # wait 는 파이프 안의 서브셸에서 해야 한다 — 밖의 wait 는 여기서 띄운 작업을 모른다
echo DONE
