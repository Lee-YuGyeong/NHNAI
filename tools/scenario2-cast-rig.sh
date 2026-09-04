#!/usr/bin/env sh
# 시나리오 2 의 개체 열에 **뼈와 걸음**을 붙인다 — Tripo Studio 의 rig → animate 를 이어 돌린다.
#
#   sh tools/scenario2-cast-rig.sh <원본 폴더> [id ...]
#     결과: <원본 폴더>/<id>_anim.glb  (뼈대 + preset:biped:walk + preset:biped:idle 두 클립)
#     이어서 **반드시** node tools/tripo-anim-rebase.mjs <id>_anim.glb <id>_anim.glb 로 바인드 자세에 되앉힌 뒤
#     sh tools/scenario2-cast-glb.sh <원본 폴더> --anim 로 경량화한다 (2026-09-03: 리타깃이 이름표 잘못 붙은 뼈에
#     상수 오프셋을 얹어 팔이 위로·머리가 접힌다 — rebase 없이는 열 몸 중 아홉이 깨진다).
#   ★ 프롬프트는 팔을 **내린 채**로 뽑는다 — 리타깃은 팔 뼈에 트랙을 안 얹어 모델링된 팔 자세가 그대로 굳는다(A 포즈 금지).
#
# ★ 왜 필요한가: 개체 열은 text-to-model 로 뽑은 **정지 메시**였다. 그대로 걷게 하면 발이 안 움직이는 채로
#   미끄러진다 (2026-09-02 사용자: 「로봇들은 맵을 돌아다닐 수 있게」). 몸은 성격마다 다른 그 몸을 그대로 쓰고
#   뼈만 나중에 넣는 것이 이 파이프라인이다 — 다시 뽑지 않는다.
#
# ★ 한 몸 ≈ 20 크레딧 (rig + animate). Studio 지갑을 쓴다 (tripo-studio-parts.sh 머리말의 「지갑이 둘이다」).
#   2026-09-03 실측: 열 프로젝트 모두 rigging 이 이미 success 인 상태에서 `process animate` 만 열 번 돌렸는데
#   잔액이 1410 → 1410 으로 **한 푼도 안 빠졌다** (retarget 은 project history 에도 안 남는다). rig 가 끝난
#   프로젝트는 이 스크립트를 다시 돌리지 말고 animate 만 부를 것 — rig 재제출이 유일하게 돈이 드는 단계다.
#   `export --operator-id <rigging op> --with-animation` 은 뼈만 오고 클립은 없다 (export 의 --dry-run 은 실제로 돈다).
# ★ 걸음이 반만 오는 몸이 있다: Tripo 가 팔 뼈를 못 잡으면(joints 13~17) 팔이 앞으로 굳은 채 다리만 걷고,
#   seer·leader 처럼 몸 전체가 앞으로 꺾이기도 한다. tools/cast-walk-sheet.mjs 로 팔·다리 둘 다 움직이는지 보고
#   아니면 리깅본을 버리고 비리깅 파일을 그대로 둔다 (9/3 결과: guard21·u012·u137 만 통과).
# ★ 2026-09-03 오후 — 클립은 Tripo 것을 **안 쓴다**: node tools/cast-anim-synth.mjs synth <id>_anim.glb <id>_anim.glb 로 걸음·숨을 코드로 다시 짓는다.
#   재 보니(같은 도구의 metric) 열 몸 전부 Tripo 리타깃이 무릎을 뒤로 꺾거나(u012 −85°) 두 다리를 같은 위상으로 흔들거나(guard21·leader 0π)
#   발을 옆으로 휘둘렀고(u063·u137·u201) 팔 트랙은 없었다 — 「통과」로 보였던 셋도 가까이서는 아니었다. synth 는 리그의 **뼈만** 받아
#   기하로 다리·척추·팔을 가려낸 뒤(이름표 안 믿음) 1 s 걸음(허벅지 ±22°·무릎 0→35°·골반 2 cm·팔 ±10°)과 4 s 숨을 쓰고, Root 에 남은
#   다리 살(u104 42%)을 다리 뼈로 옮긴다. 순서: rig → animate(뼈만 받으려고) → synth → scenario2-cast-glb.sh --anim → cast-walk-sheet.mjs.
#   rebase(tripo-anim-rebase.mjs)는 이제 안 거친다 — synth 가 클립을 통째로 갈아 끼우니 오프셋이 남을 데가 없다.
#   u089 는 r3 리그의 다리 뼈가 엉덩이 한쪽(z −0.15)에 몰려 있어 synth 가 다리를 못 찾는다 → `synth --rerig` 가 살에서 뼈대(root·척추·머리·다리 둘)를 다시 세운다. 팔은 척추에 붙어 굳는다.
# ★ 프로젝트 번호는 tools/scenario2-cast-projects.json 이 쥔다 — 생성 로그의 task id 로 한 번 찾아 적어 둔 것이다.
set -eu
OUT="${1:?원본 폴더}"; shift
ONLY="$*"
TRIPO="${TRIPO_CLI:-npx --yes @tripo3d/cli}"
MAP="$(cd "$(dirname "$0")" && pwd)/scenario2-cast-projects.json"

$TRIPO auth whoami >/dev/null 2>&1 || { echo "Studio 로그인이 없다: npx @tripo3d/cli auth login --email <이메일>" >&2; exit 3; }
$TRIPO account balance

node -e '
  const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  for (const [id, pid] of Object.entries(m)) if (pid) console.log(id + "\t" + pid);
' "$MAP" | { while IFS="$(printf '\t')" read -r id pid; do
  if [ -n "$ONLY" ] && ! echo " $ONLY " | grep -q " $id "; then continue; fi
  if [ -f "$OUT/${id}_anim.glb" ]; then echo "건너뜀 (이미 있음): $id"; continue; fi
  (
    echo "리깅: $id"
    $TRIPO process rig "$pid" --check > "$OUT/$id.rig.log" 2>&1
    grep -q "Riggable: *true" "$OUT/$id.rig.log" || { echo "리깅 불가: $id"; exit 0; }
    $TRIPO process rig "$pid" --submit-only --timeout 20m >> "$OUT/$id.rig.log" 2>&1
    # 리깅이 끝날 때까지 — animate 는 프로젝트의 마지막 연산이 성공한 rigging 이라야 받아 준다
    op=$(grep -o 'Task created: [0-9a-f-]*' "$OUT/$id.rig.log" | tail -1 | awk '{print $3}')
    while :; do
      st=$($TRIPO task get "$op" --output-format json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).status)}catch{console.log("?")}})')
      [ "$st" = "success" ] && break
      [ "$st" = "failed" ] || [ "$st" = "banned" ] && { echo "리깅 실패: $id"; exit 0; }
      sleep 10
    done
    echo "걸음: $id"
    $TRIPO process animate "$pid" --animations preset:biped:walk,preset:biped:idle \
      -o "$OUT/${id}_anim.glb" --timeout 25m >> "$OUT/$id.rig.log" 2>&1 \
      && echo "저장: $OUT/${id}_anim.glb" || echo "실패: $id (로그 $OUT/$id.rig.log)"
  ) &
  while [ "$(jobs -r | wc -l)" -ge 3 ]; do sleep 3; done
done; wait; }   # wait 는 파이프 안의 서브셸에서 해야 한다 — 밖의 wait 는 여기서 띄운 작업을 모른다
echo DONE
