#!/usr/bin/env sh
# 휴머노이드 로봇 GLB 를 웹용으로 줄인다: 원본(Tripo, 197만 삼각형 · 4096² 텍스처 3장 · 78MB) → 118k 삼각형 · 2048² · 6MB.
# 뼈대·스킨 가중치는 그대로 남는다 (RobotAvatar 가 뼈를 직접 돌린다). 원본 GLB 에는 애니메이션 클립이 없다.
#
#   sh tools/robot-glb.sh "/path/to/휴머노이드+로봇+3D+모델.glb"        → public/world/robot.glb
#
# 더 촘촘히 보고 싶으면 --ratio 를 올린다 (0.12 ≈ 236k 삼각형 · 12MB).
set -eu
SRC="${1:?원본 glb 경로}"
OUT="$(dirname "$0")/../public/world/robot.glb"
TMP="$(mktemp -d)"
npx --yes @gltf-transform/cli weld "$SRC" "$TMP/welded.glb"
npx --yes @gltf-transform/cli simplify --ratio 0.06 --error 0.002 "$TMP/welded.glb" "$TMP/simplified.glb"
npx --yes @gltf-transform/cli resize --width 2048 --height 2048 "$TMP/simplified.glb" "$OUT"
rm -rf "$TMP"
ls -la "$OUT"
