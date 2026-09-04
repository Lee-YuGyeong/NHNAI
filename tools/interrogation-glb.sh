#!/usr/bin/env sh
# 심문소 맵 GLB 부품을 웹용으로 줄인다 (corridor-glb.sh 와 같은 파이프라인).
#   원본: Tripo text-to-model — 힉스필드 MCP 의 tripo_3d, tools/tripo-studio-parts.sh (Studio 크레딧, 공식 CLI 로그인),
#         또는 tools/tripo-parts.mjs (API 지갑, tsk_ 키). 단일 메시, 수십만~백만 삼각형, 큰 텍스처.
#         한 번에: sh tools/tripo-studio-parts.sh tools/interrogation-parts.json <원본 폴더> --reduce tools/interrogation-glb.sh
#   결과: public/world/interrogation/<id>.glb — 삼각형 감소 · 텍스처 축소 · EXT_meshopt_compression
#
#   sh tools/interrogation-glb.sh <원본 폴더> [id ...]   (원본은 <폴더>/<id>.glb. id 를 주면 그것만 변환)
#   GLTF_TRANSFORM="경로/gltf-transform" 로 캐시된 CLI 를 쓸 수 있다.
#
# ★ 삼각형 예산 = 인스턴스 수 × 삼각형. 랙 6개 6k, 케이스 60개 남짓 2k, 링 조명 1개 3k.
set -eu
SRC_DIR="${1:?원본 폴더}"
shift
ONLY="$*"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/world/interrogation"
GLTF="${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli}"
mkdir -p "$OUT_DIR"

# id | 목표 삼각형 수(k) | 텍스처 한 변(px) | simplify 오차
# ★ 오차 상한에 먼저 걸리면 ratio 까지 못 내려간다 — Studio v3.1 부품은 1(무제한)로 두고 ratio 만 맞춘다. 의자(v2.5)는 0.003 으로도 충분했다.
TABLE='
sci_rack|6|512|1
ring_lamp|3|512|1
metal_case|2|512|1
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
  # weld + simplify 를 Permissive(seam 을 넘어 접기) 로 — Tripo v3.x 메시는 CLI simplify 로는 12% 아래로 안 내려간다
  node "$(dirname "$0")/glb-simplify-permissive.mjs" "$src" "$tmp/b.glb" "$ratio" "$err" >/dev/null
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
