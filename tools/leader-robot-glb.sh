#!/usr/bin/env sh
# 무대 위 리더(최종보스 대형 로봇)의 GLB 두 벌을 웹용으로 줄인다 — 몸(leader_robot)과 캐논(leader_cannon).
#
#   sh tools/leader-robot-glb.sh body   <원본폴더>/leader_boss-skin.glb   → public/world/warehouse/leader_robot.glb
#   sh tools/leader-robot-glb.sh cannon <원본폴더>/leader_cannon.glb      → public/world/warehouse/leader_cannon.glb
#
# 전체 절차 (2026-09-01, 사용자: "무대 로봇 디자인이 마음에 안 든다 — 위압감 넘치는 총 든 최종보스로").
# 무장 심문 AI(tools/enforcer-glb.sh)와 같은 길이다:
#   1) 메시:   sh tools/tripo-studio-parts.sh tools/leader-parts.json <원본폴더>   (→ leader_boss.glb · leader_cannon.glb)
#              ★ 로봇은 **빈손** 으로 뽑는다 — 총을 든 채 뽑으면 리거가 손과 총을 뒤섞는다 (심문 AI 첫 판에서 손이 4개가 됐다).
#              프로젝트 id 는 `npx @tripo3d/cli project list --output-format json` 의 project_id (로그의 Task id 는 operator_id).
#   2) 리깅:   npx @tripo3d/cli process rig <project-id> --check   → Riggable: true 면
#              npx @tripo3d/cli process rig <project-id> -o <원본폴더>/leader_boss-rig.glb      (이 파일엔 뼈가 없다)
#   3) 스킨:   npx @tripo3d/cli process animate <project-id> --animations preset:biped:idle -o <원본폴더>/leader_boss-anim.glb
#              (뼈·스킨이 들어오는 유일한 출력. 프리셋 클립 자체는 뼈 이름표 혼선으로 엉켜 있어 쓰지 않는다 —
#               대기·걷기·분노·조준·발사는 features/world/enforcerPose.ts 가 코드로 만든다)
#   4) 클립 제거·경량화:
#              node tools/glb-strip-anim.mjs <원본폴더>/leader_boss-anim.glb <원본폴더>/leader_boss-skin.glb
#              sh tools/leader-robot-glb.sh body   <원본폴더>/leader_boss-skin.glb
#              sh tools/leader-robot-glb.sh cannon <원본폴더>/leader_cannon.glb
#
# 캐논은 seam 을 잠그는 CLI simplify 라야 텍스처가 안 뭉개진다 (glb-simplify-permissive 는 UV 를 깨뜨렸다 — 소총에서 겪었다).
set -eu
WHAT="${1:?body 또는 cannon}"
SRC="${2:?원본 glb 경로}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GLTF="${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli}"
case "$WHAT" in
  body)   OUT="$ROOT/public/world/warehouse/leader_robot.glb";  RATIO=0.08; TEX=2048 ;;
  cannon) OUT="$ROOT/public/world/warehouse/leader_cannon.glb"; RATIO=0.05; TEX=1024 ;;
  *) echo "첫 인자는 body 또는 cannon" >&2; exit 2 ;;
esac
TMP="$(mktemp -d)"
$GLTF weld "$SRC" "$TMP/a.glb" >/dev/null
$GLTF simplify --ratio "$RATIO" --error 0.002 "$TMP/a.glb" "$TMP/b.glb" >/dev/null
$GLTF resize --width "$TEX" --height "$TEX" "$TMP/b.glb" "$TMP/c.glb" >/dev/null
$GLTF meshopt --level medium "$TMP/c.glb" "$OUT" >/dev/null
rm -rf "$TMP"
ls -la "$OUT"
