#!/usr/bin/env sh
# 작업 구역(world2/map/work.tsx) GLB 부품을 웹용으로 줄인다 (warehouse-glb.sh 와 같은 파이프라인).
#   원본: Tripo text-to-model — 단일 메시, 수십만~백만 삼각형, 큰 텍스처
#   결과: public/world/work/<id>.glb — 삼각형 감소 · 텍스처 축소 · EXT_meshopt_compression
#
#   sh tools/work-glb.sh <원본 폴더> [id ...]   (원본은 <폴더>/<id>.glb. id 를 주면 그것만 변환)
#   한 번에: sh tools/tripo-studio-parts.sh tools/work-parts.json <원본 폴더> --reduce tools/work-glb.sh
#
# ★ 오차(err)가 1 인 줄은 Studio v3.1 부품 — glb-simplify-permissive.mjs 로 줄인다 (warehouse-glb.sh 참고).
# ★ 삼각형 예산: 소각로는 방에 1개뿐인 주역 프롭이라 60k — 6k·24k 로는 146만 삼각형 원본의 UV 가 걸레가 된다 (2026-09-03 프리뷰). 텍스처는 1024.
set -eu
SRC_DIR="${1:?원본 폴더}"
shift
ONLY="$*"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/world/work"
GLTF="${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli}"
mkdir -p "$OUT_DIR"

# id | 목표 삼각형 수(k) | 텍스처 한 변(px) | simplify 오차
TABLE='
incinerator|60|1024|1
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
  if [ "$err" = "1" ]; then
    node "$(dirname "$0")/glb-simplify-permissive.mjs" "$src" "$tmp/b.glb" "$ratio" "$err" >/dev/null
  else
    $GLTF weld "$src" "$tmp/a.glb" >/dev/null
    $GLTF simplify --ratio "$ratio" --error "$err" "$tmp/a.glb" "$tmp/b.glb" >/dev/null
  fi
  $GLTF resize --width "$tex" --height "$tex" "$tmp/b.glb" "$tmp/c.glb" >/dev/null
  $GLTF meshopt --level medium "$tmp/c.glb" "$out" >/dev/null
  rm -rf "$tmp"
  ls -la "$out"
}

echo "$TABLE" | grep -v '^$' | while IFS='|' read -r en ktri tex err; do
  if [ -n "$ONLY" ] && ! echo " $ONLY " | grep -q " $en "; then continue; fi
  convert "$en" "$ktri" "$tex" "$err" &
  while [ "$(jobs -r | wc -l)" -ge 3 ]; do sleep 1; done
done
wait
echo DONE
