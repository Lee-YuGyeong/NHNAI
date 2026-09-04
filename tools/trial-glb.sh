#!/usr/bin/env sh
# 물리 미니게임(정지선) 소품 GLB 를 웹용으로 줄인다 (interrogation-glb.sh 와 같은 파이프라인).
#   원본: Tripo text-to-model — 힉스필드 MCP 의 tripo_3d (2026-09-04, 한 개 5 크레딧). 프롬프트는 tools/trial-parts.json.
#         tools/tripo-studio-parts.sh tools/trial-parts.json <원본 폴더> --reduce tools/trial-glb.sh 로도 같은 결과가 난다.
#   결과: public/world/trial/<id>.glb — 삼각형 감소 · 텍스처 축소 · EXT_meshopt_compression
#
#   sh tools/trial-glb.sh <원본 폴더> [id ...]   (원본은 <폴더>/<id>.glb. id 를 주면 그것만 변환)
#
# ★ 삼각형 예산 = 인스턴스 수 × 삼각형. 게이트는 레인마다 하나(최대 6) 6k, 비콘은 레인마다 하나 2k, 공은 동시에 ~10개 2k(구라 적어도 된다).
set -eu
SRC_DIR="${1:?원본 폴더}"
shift
ONLY="$*"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/world/trial"
GLTF="${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli}"
mkdir -p "$OUT_DIR"

# id | 목표 삼각형 수(k) | 텍스처 한 변(px) | simplify 오차
TABLE='
trial_gate|6|512|1
trial_beacon|2|512|1
trial_pod|3|512|1
ball_basketball|2|512|1
ball_soccer|2|512|1
ball_baseball|2|512|1
ball_pingpong|1|256|1
ball_bowling|2|512|1
'

convert() {
  en="$1"; ktri="$2"; tex="$3"; err="$4"
  src="$SRC_DIR/$en.glb"; out="$OUT_DIR/$en.glb"; tmp="$(mktemp -d)"
  tri=$(node -e '
    const fs=require("fs");const fd=fs.openSync(process.argv[1],"r");const h=Buffer.alloc(20);fs.readSync(fd,h,0,20,0);
    const len=h.readUInt32LE(12);const b=Buffer.alloc(len);fs.readSync(fd,b,0,len,20);const j=JSON.parse(b.toString());
    let t=0;for(const m of j.meshes)for(const p of m.primitives)t+=(p.indices!==undefined?j.accessors[p.indices].count:j.accessors[p.attributes.POSITION].count)/3;
    console.log(Math.round(t));' "$src")
  ratio=$(node -e "console.log(Math.min(1, ($ktri*1000)/$tri).toFixed(5))")
  echo "[$en] tri=$tri → ratio=$ratio  tex=${tex}²  err=$err"
  node "$(dirname "$0")/glb-simplify-permissive.mjs" "$src" "$tmp/b.glb" "$ratio" "$err" >/dev/null
  $GLTF resize --width "$tex" --height "$tex" "$tmp/b.glb" "$tmp/c.glb" >/dev/null
  $GLTF meshopt --level medium "$tmp/c.glb" "$out" >/dev/null
  rm -rf "$tmp"
  ls -la "$out"
}

echo "$TABLE" | grep -v '^$' | while IFS='|' read -r en ktri tex err; do
  if [ -n "$ONLY" ] && ! echo " $ONLY " | grep -q " $en "; then continue; fi
  [ -f "$SRC_DIR/$en.glb" ] || { echo "원본 없음: $SRC_DIR/$en.glb" >&2; continue; }
  convert "$en" "$ktri" "$tex" "$err" &
  while [ "$(jobs -r | wc -l)" -ge 3 ]; do sleep 1; done
done
wait
echo DONE
