#!/usr/bin/env sh
# 검문소 플레이어 아바타 — 군인 넷(사용자 제공 Tripo 리깅 GLB, 클립 5개: walk·run·jump·agree·angry)을 웹용으로 줄인다.
#   원본: 각 ~77MB · 190만 삼각형 · 4096² 텍스처 3장. 결과: public/world/soldier/<id>.glb (≈57k 삼각형 · 1024² · meshopt)
#   뼈대·스킨·클립은 그대로 남는다 (robot-glb.sh 와 같은 파이프라인 — CLI simplify 는 seam 을 잠근다).
#
#   sh tools/soldier-glb.sh <원본 폴더> [id ...]   (원본 파일명은 아래 TABLE 의 오른쪽 — 사용자가 준 이름 그대로)
#   RATIO=0.1 TEX=2048 OUT_DIR=… 로 예산을 바꾼다
set -eu
SRC_DIR="${1:?원본 폴더}"; shift; ONLY="$*"
OUT_DIR="${OUT_DIR:-$(cd "$(dirname "$0")/.." && pwd)/public/world/soldier}"
# 삼각형 비율·텍스처 한 변 — 환경변수로 바꿔 비교할 수 있다. 0.03·1024 는 눈이 뭉개졌다 (2026-09-04 사용자 지적) → 기본을 올렸다
RATIO="${RATIO:-0.1}"
TEX="${TEX:-2048}"
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
  # weld 는 뗀다 — 가까운 정점을 UV 가 달라도 합쳐 **눈이 뭉개졌다** (2026-09-04 실측: ratio·텍스처를 올려도 안 돌아왔다). NOWELD=0 이면 예전대로
  if [ "${NOWELD:-1}" = "1" ]; then cp "$src" "$tmp/a.glb"; else $GLTF weld "$src" "$tmp/a.glb" >/dev/null; fi
  # 눈 자리를 잠근 simplify (tools/glb-simplify-lock.mjs) — CLI simplify 는 눈을 접어 감은 눈이 됐다. LOCKEYES=0 이면 CLI
  if [ "${LOCKEYES:-1}" = "1" ]; then node "$(dirname "$0")/glb-simplify-lock.mjs" "$tmp/a.glb" "$tmp/b.glb" "$RATIO"; else $GLTF simplify --ratio "$RATIO" --error 0.001 "$tmp/a.glb" "$tmp/b.glb" >/dev/null; fi
  $GLTF resize --width "$TEX" --height "$TEX" "$tmp/b.glb" "$tmp/c.glb" >/dev/null
  $GLTF meshopt --level medium "$tmp/c.glb" "$out" >/dev/null
  rm -rf "$tmp"
  ls -la "$out"
}
echo "$TABLE" | grep -v '^$' | while IFS='|' read -r id file; do
  if [ -n "$ONLY" ] && ! echo " $ONLY " | grep -q " $id "; then continue; fi
  convert "$id" "$file" &
  while [ "$(jobs -r | wc -l)" -ge 2 ]; do sleep 1; done
done
wait
echo DONE
