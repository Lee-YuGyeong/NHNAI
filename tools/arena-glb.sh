#!/usr/bin/env sh
# 시행 표식 부품을 웹용으로 줄인다 (warehouse-glb.sh 와 같은 파이프라인).
#   원본: 힉스필드 MCP 의 generate_image → generate_3d(image_to_3d, 텍스처 없음) — 단일 메시 3만 삼각형
#   결과: public/world/arena/<id>.glb — 삼각형 감소 · EXT_meshopt_compression
#
#   sh tools/arena-glb.sh <원본 폴더> [id ...]
#
# ★ 텍스처가 없다 — 색은 판이 입힌다 (arena3d/map/markers.tsx 의 Zones 가 상태마다 다른 색으로 칠한다).
#   그래서 resize 가 아니라 **strip** 이다: 있으면 벗겨서 형상만 남긴다 (tools/glb-strip-tex.mjs).
#   Tripo Studio 는 늘 2048² PBR 석 장을 얹어 주는데, 재질을 갈아 끼우고 나면 그 석 장은 한 픽셀도
#   안 보이면서 파일 766KB · VRAM 67MB 를 먹는다 (2026-09-03 검사문). UV 도 같이 나가서 simplify 도 잘 접힌다.
# ★ 삼각형 예산 = 한 판에 최대 세 개(금지 원을 둘러싸는 말뚝 셋)라 개당 2k 면 넉넉하다.
#   검사문만 4k 다 — 판에 하나뿐이고, 1인칭으로 **그 사이를 걸어서 지나간다**. 실루엣이 코앞에서 읽힌다.
# ★ 집합 표식의 등은 여기 없다 — 뽑아 온 것의 받침이 지름 0.83m 로 나와서 코드로 짓는다
#   (src/arena3d/map/markers.tsx 의 Post). 이 파이프라인은 **비율이 맞게 나온 것**만 통과시킨다.
set -eu
SRC_DIR="${1:?원본 폴더}"
shift
ONLY="$*"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/world/arena"
GLTF="${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli}"
mkdir -p "$OUT_DIR"

# id | 목표 삼각형 수(k) | simplify 오차
TABLE='
hazard_beacon|2|1
gate_frame|4|1
'

convert() {
  en="$1"; ktri="$2"; err="$3"
  src="$SRC_DIR/$en.glb"; out="$OUT_DIR/$en.glb"; tmp="$(mktemp -d)"
  # 텍스처부터 벗긴다 — 이 뒤로는 형상뿐이라 이음매가 접는 것을 막지 않는다
  node "$(dirname "$0")/glb-strip-tex.mjs" "$src" "$tmp/bare.glb"
  src="$tmp/bare.glb"
  tri=$(node -e '
    const fs=require("fs");const fd=fs.openSync(process.argv[1],"r");const h=Buffer.alloc(20);fs.readSync(fd,h,0,20,0);
    const len=h.readUInt32LE(12);const b=Buffer.alloc(len);fs.readSync(fd,b,0,len,20);const j=JSON.parse(b.toString());
    let t=0;for(const m of j.meshes)for(const p of m.primitives)t+=(p.indices!==undefined?j.accessors[p.indices].count:j.accessors[p.attributes.POSITION].count)/3;
    console.log(Math.round(t));' "$src")
  ratio=$(node -e "console.log(Math.min(1, ($ktri*1000)/$tri).toFixed(5))")
  echo "[$en] tri=$tri → ratio=$ratio  err=$err"
  # 오차 1 은 **seam 을 넘어 접는 길**이다 — CLI simplify 는 UV 이음매에 막혀 30% 아래로 안 내려간다
  # (warehouse-glb.sh 의 ★ 와 같은 자리). 이 부품들은 텍스처가 없어 이음매를 지켜 봐야 얻을 것이 없다.
  if [ "$err" = "1" ]; then
    node "$(dirname "$0")/glb-simplify-permissive.mjs" "$src" "$tmp/b.glb" "$ratio" "$err" >/dev/null
  else
    $GLTF weld "$src" "$tmp/a.glb" >/dev/null
    $GLTF simplify --ratio "$ratio" --error "$err" "$tmp/a.glb" "$tmp/b.glb" >/dev/null
  fi
  $GLTF meshopt --level medium "$tmp/b.glb" "$out" >/dev/null
  rm -rf "$tmp"
  ls -la "$out"
}

echo "$TABLE" | grep -v '^$' | while IFS='|' read -r en ktri err; do
  if [ -n "$ONLY" ] && ! echo " $ONLY " | grep -q " $en "; then continue; fi
  convert "$en" "$ktri" "$err"
done
echo DONE
