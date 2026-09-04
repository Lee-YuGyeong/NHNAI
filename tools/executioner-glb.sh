#!/usr/bin/env sh
# 검문소 무대 위 처형자(사용자 제공 Tripo 리깅 GLB, 클립 없음)와 총(정지 메시)을 웹용으로 줄인다.
#   sh tools/executioner-glb.sh <원본 폴더>     (원본: <폴더>/처형자.glb · <폴더>/gun.glb → public/world/executioner/{executioner,gun}.glb)
#   몸은 군인과 같은 길(눈 자리 잠근 simplify, tools/glb-simplify-lock.mjs) — 뼈·스킨 보존. 총은 CLI weld·simplify (seam 잠금).
#   움직임은 GLB 클립이 아니라 코드다 (features/world/enforcerPose.ts) — 무장 심문 AI · 리더와 같은 파이프라인.
set -eu
SRC_DIR="${1:?원본 폴더}"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/world/executioner"
GLTF="${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli}"
mkdir -p "$OUT_DIR"
tmp="$(mktemp -d)"
# 몸
cp "$SRC_DIR/처형자.glb" "$tmp/a.glb"
node "$(dirname "$0")/glb-simplify-lock.mjs" "$tmp/a.glb" "$tmp/b.glb" 0.06
$GLTF resize --width 2048 --height 2048 "$tmp/b.glb" "$tmp/c.glb" >/dev/null
$GLTF meshopt --level medium "$tmp/c.glb" "$OUT_DIR/executioner.glb" >/dev/null
# 총 — 먼저 소총 기준 좌표(총열 +z · 위 +y · 길이 1)로 돌려 놓는다 (tools/gun-orient.mjs). 원본은 대각선으로 누워 있다
node "$(dirname "$0")/gun-orient.mjs" "$SRC_DIR/gun.glb" "$tmp/g0.glb"
$GLTF weld "$tmp/g0.glb" "$tmp/g1.glb" >/dev/null
$GLTF simplify --ratio 0.03 --error 0.002 "$tmp/g1.glb" "$tmp/g2.glb" >/dev/null
$GLTF resize --width 1024 --height 1024 "$tmp/g2.glb" "$tmp/g3.glb" >/dev/null
$GLTF meshopt --level medium "$tmp/g3.glb" "$OUT_DIR/gun.glb" >/dev/null
rm -rf "$tmp"
ls -la "$OUT_DIR"
echo DONE
