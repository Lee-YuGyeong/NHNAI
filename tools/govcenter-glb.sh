#!/usr/bin/env sh
# 특수인공지능대응센터 홀(map/govcenter.tsx) GLB 부품을 웹용으로 줄인다 (warehouse-glb.sh 와 같은 파이프라인).
#   원본: Tripo Studio v3.1 text-to-model (tools/govcenter-parts.json → tripo-studio-parts.sh) — 단일 메시, 수십 MB
#   결과: public/world/govcenter/<id>.glb — 삼각형 감소(seam 을 넘어 접는 permissive) · 텍스처 축소 · EXT_meshopt_compression
#
#   sh tools/govcenter-glb.sh <원본 폴더> [id ...]
#   한 번에: sh tools/tripo-studio-parts.sh tools/govcenter-parts.json <원본 폴더> --reduce tools/govcenter-glb.sh
#
# ★ 삼각형 예산 = 인스턴스 수 × 삼각형. 서버 랙 ~14개, 워크스테이션 ~12개, 철문 4개, 벽등 8개, 옆벽 콘솔 16개.
#   알베도는 어차피 버린다 (useShapedMaterial — 노멀맵만 쓴다) — 텍스처 한 변을 작게 잡아도 손해가 없다.
set -eu
SRC_DIR="${1:?원본 폴더}"
shift
ONLY="$*"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/world/govcenter"
GLTF="${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli}"
mkdir -p "$OUT_DIR"

# id | 목표 삼각형 수(k) | 텍스처 한 변(px) | simplify 오차 (1 = Studio v3.1, permissive)
TABLE='
gov_server_rack|3|512|1
gov_workstation|4|512|1
gov_steel_door|3|512|1
gov_wall_lamp|1.5|256|1
gov_console|12|512|1
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
  while [ "$(jobs -r | wc -l)" -ge 2 ]; do sleep 1; done
done
wait
echo DONE
