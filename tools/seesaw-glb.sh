#!/usr/bin/env sh
# 무게 중심 다리 미니게임 부품(tools/seesaw-parts.json → tripo-studio-parts.sh)을 웹용으로 줄인다 — disc-glb.sh 와 같은 파이프라인 (Studio v3.1, permissive).
#   sh tools/seesaw-glb.sh <원본 폴더> [id ...]      → public/world/seesaw/<id>.glb
set -eu
SRC_DIR="${1:?원본 폴더}"; shift; ONLY="$*"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/world/seesaw"
GLTF="${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli}"
mkdir -p "$OUT_DIR"
# id | 목표 삼각형(k) | 텍스처 | 오차(1 = permissive). 받침대는 하나(가운데) — 8k, 멈춤쇠는 넷(양 끝 둘씩) — 2k
TABLE='
seesaw_pivot|8|512|1
seesaw_stop|2|256|1
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
  echo "[$en] tri=$tri → ratio=$ratio tex=${tex}²"
  node "$(dirname "$0")/glb-simplify-permissive.mjs" "$src" "$tmp/b.glb" "$ratio" "$err" >/dev/null
  $GLTF resize --width "$tex" --height "$tex" "$tmp/b.glb" "$tmp/c.glb" >/dev/null
  $GLTF meshopt --level medium "$tmp/c.glb" "$out" >/dev/null
  rm -rf "$tmp"; ls -la "$out"
}
echo "$TABLE" | grep -v '^$' | while IFS='|' read -r en ktri tex err; do
  if [ -n "$ONLY" ] && ! echo " $ONLY " | grep -q " $en "; then continue; fi
  convert "$en" "$ktri" "$tex" "$err"
done
echo DONE
