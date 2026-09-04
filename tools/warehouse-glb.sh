#!/usr/bin/env sh
# 창고 맵 GLB 부품을 웹용으로 줄인다 (corridor-glb.sh 와 같은 파이프라인).
#   원본: Tripo text-to-model (힉스필드 MCP 의 tripo_3d 경유) — 단일 메시, 수십만~백만 삼각형, 큰 텍스처
#   결과: public/world/warehouse/<id>.glb — 삼각형 감소 · 텍스처 축소 · EXT_meshopt_compression
#
#   sh tools/warehouse-glb.sh <원본 폴더> [id ...]   (원본은 <폴더>/<id>.glb. id 를 주면 그것만 변환)
#   GLTF_TRANSFORM="경로/gltf-transform" 로 캐시된 CLI 를 쓸 수 있다.
#   한 번에: sh tools/tripo-studio-parts.sh tools/warehouse-parts.json <원본 폴더> --reduce tools/warehouse-glb.sh
#
# ★ 오차(err)가 1 인 줄은 **Studio v3.1 부품**이다 — CLI simplify 로는 12% 아래로 안 내려가서
#   glb-simplify-permissive.mjs(seam 을 넘어 접는다)로 줄인다. 나머지(옛 v2.x 부품)는 weld + simplify 그대로다.
#
# ★ 삼각형 예산 = 인스턴스 수 × 삼각형. 랙 8개 6k, 트러스 7틀 4k, 갓등 9개 3k, 기둥 16개 2k, 널판 패널은 100장 넘게 붙으니 0.6k.
set -eu
SRC_DIR="${1:?원본 폴더}"
shift
ONLY="$*"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/world/warehouse"
GLTF="${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli}"
mkdir -p "$OUT_DIR"

# id | 목표 삼각형 수(k) | 텍스처 한 변(px) | simplify 오차
# ★ simplify 는 --error 상한에 먼저 걸리면 ratio 까지 못 내려간다 — 평평한 것(패널·박스)은 오차를 크게 줘야 목표 삼각형 수가 나온다.
TABLE='
pendant_lamp|3|512|0.003
steel_rack|6|512|0.004
roof_truss|4|256|0.003
plank_wall_panel|0.6|1024|0.02
stage_platform|2|512|0.005
header_beam|3|512|0.003
steel_column|2|512|0.005
x_brace|2|256|0.005
podium|4|512|0.003
cargo_container|3|512|1
crane_hoist|4|512|1
charge_dock|4|512|1
watch_drone|3|256|1
hall_fan|2|256|1
wall_arm|3|256|1
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
