#!/usr/bin/env sh
# 무장 심문 AI 로봇(sci_enforcer) — Tripo Studio 로 생성 → 리깅 → 클립 제거 → 웹용 경량화. 소총(sci_rifle)은 따로 경량화한다.
#
#   1) 메시:   sh tools/tripo-studio-parts.sh tools/enforcer-parts.json <원본폴더>      (→ <원본폴더>/sci_enforcer.glb·sci_rifle.glb)
#              ★ 로봇은 **엄격한 T 포즈·빈손** 으로 뽑는다 — 총을 든 채 뽑으면 리거가 손·총을 뒤섞어 손이 4개가 된다 (2026-08-29 첫 판).
#              프로젝트 id 는 `npx @tripo3d/cli project list --output-format json` 의 project_id (로그의 Task id 는 operator_id).
#   2) 리깅:   npx @tripo3d/cli process rig <project-id> --check   → Riggable: true 면
#              npx @tripo3d/cli process rig <project-id> -o <원본폴더>/sci_enforcer-rig.glb     (이 파일엔 뼈가 없다 — 3) 의 결과에 들어온다)
#   3) 스킨:   npx @tripo3d/cli process animate <project-id> --animations preset:biped:idle -o <원본폴더>/sci_enforcer-anim.glb
#              (뼈·스킨이 들어오는 유일한 출력. 프리셋 클립 자체는 뼈 이름표 혼선으로 엉켜 있어 쓰지 않는다 — 걷기·달리기·조준은
#               features/world/enforcerPose.ts 가 코드로 만든다. 문서의 preset:walk 는 "invalid animation" 으로 거부, preset:biped:* 만 받는다)
#   4) 클립 제거·경량화:
#              node tools/glb-strip-anim.mjs <원본폴더>/sci_enforcer-anim.glb <원본폴더>/sci_enforcer-skin.glb
#              sh tools/enforcer-glb.sh <원본폴더>/sci_enforcer-skin.glb                   → public/world/enforcer.glb
#   5) 소총:   npx --yes @gltf-transform/cli weld sci_rifle.glb a.glb && … simplify --ratio 0.04 --error 0.02 && resize 1024 && meshopt
#              → public/world/enforcer_rifle.glb (seam 을 잠그는 CLI simplify 라야 텍스처가 안 뭉개진다 — permissive 는 UV 를 깨뜨렸다)
#
# 뼈대·스킨은 그대로 남긴다 (robot-glb.sh 와 같은 파이프라인 — CLI simplify 는 seam 을 잠그지만 리깅 메시는 충분히 줄었다).
set -eu
SRC="${1:?애니메이션 붙은 glb 경로}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/world/enforcer.glb"
GLTF="${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli}"
TMP="$(mktemp -d)"
$GLTF weld "$SRC" "$TMP/a.glb" >/dev/null
$GLTF simplify --ratio 0.08 --error 0.002 "$TMP/a.glb" "$TMP/b.glb" >/dev/null
$GLTF resize --width 2048 --height 2048 "$TMP/b.glb" "$TMP/c.glb" >/dev/null
$GLTF meshopt --level medium "$TMP/c.glb" "$OUT" >/dev/null
rm -rf "$TMP"
ls -la "$OUT"
