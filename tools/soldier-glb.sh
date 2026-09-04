#!/usr/bin/env sh
# 검문소 플레이어 아바타 — 군인 넷(사용자 제공 Tripo 리깅 GLB, 클립 5개: walk·run·jump·agree·angry)을 웹용으로 줄인다.
#   원본: 각 ~77MB · 190만 삼각형 · 4096² 텍스처 3장. 결과: public/world/soldier/<id>.glb (≈57k 삼각형 · 1024² · meshopt)
#   뼈대·스킨·클립은 그대로 남는다 (robot-glb.sh 와 같은 파이프라인 — CLI simplify 는 seam 을 잠근다).
#
#   sh tools/soldier-glb.sh <원본 폴더>    (원본 파일명은 아래 TABLE 의 오른쪽 — 사용자가 준 이름 그대로)
set -eu
SRC_DIR="${1:?원본 폴더}"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/world/soldier"
GLTF="${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli}"
mkdir -p "$OUT_DIR"
# id|원본 파일명
TABLE='
sol_heavy_m|비만남군.glb
sol_heavy_f|비만여군.glb
sol_fit_f|이쁜여군.glb
sol_fit_m|잘생긴+남군.glb
'
convert() {
  id="$1"; src="$SRC_DIR/$2"; out="$OUT_DIR/$id.glb"; tmp="$(mktemp -d)"
  $GLTF weld "$src" "$tmp/a.glb" >/dev/null
  $GLTF simplify --ratio 0.03 --error 0.002 "$tmp/a.glb" "$tmp/b.glb" >/dev/null
  $GLTF resize --width 1024 --height 1024 "$tmp/b.glb" "$tmp/c.glb" >/dev/null
  $GLTF meshopt --level medium "$tmp/c.glb" "$out" >/dev/null
  rm -rf "$tmp"
  ls -la "$out"
}
echo "$TABLE" | grep -v '^$' | while IFS='|' read -r id file; do
  convert "$id" "$file" &
  while [ "$(jobs -r | wc -l)" -ge 2 ]; do sleep 1; done
done
wait
echo DONE
