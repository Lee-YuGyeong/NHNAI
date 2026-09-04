#!/usr/bin/env sh
# Black & Gold 복도 맵 GLB 22개를 웹용으로 줄인다.
#   원본: Downloads/무제_폴더_6/<한글명>.glb — Tripo 단일 메시, 각 ~190만 삼각형 · 4096² 텍스처 3장 · 50~60MB
#   결과: public/world/corridor/<영문명>.glb — 삼각형 감소 · 부품별 텍스처 크기 · EXT_meshopt_compression (drei useGLTF 기본 지원)
# 한글 오브젝트명 ↔ 영문 파일명 매핑은 아래 표가 원본이다. src/world/assets/manifest.ts 의 id 와 같다.
#
#   sh tools/corridor-glb.sh [원본 폴더]      (기본: ~/Downloads/무제_폴더_6)
#   GLTF_TRANSFORM="경로/gltf-transform" 를 주면 npx 대신 그 실행 파일을 쓴다 (오프라인·캐시된 CLI)
#
# ★ 삼각형 예산은 "인스턴스 수 × 삼각형" 이다. 타일 55장·슬랫 25장·리브드 스트립 40장이 깔리니 그것들은 수백~수천이면 충분하고,
#   식물은 8그루씩이라 2만을 넘기면 씬의 절반이 잎이 된다. 원본 그대로의 디테일을 남길 것은 기둥·대리석 패널뿐이다.
# ★ 텍스처는 1024² 3장이면 밉맵 포함 16MB — 22개 전부면 350MB 라 iOS Safari 가 컨텍스트를 잃는다.
#   단면 10cm 이하(몰딩·걸레받이·벽등)는 256², 중간 크기는 512², 눈앞에서 보는 대리석·기둥·바닥만 1024² (식물은 2m 밖에서 보는 잎이라 512² 면 충분).
#   발광 재질로 통째로 갈아끼우는 3종(LED 바·코브 바·바닥 테두리 몰딩)은 텍스처를 4² 로 — 사실상 없앤다 (CLI 에 떼어내는 명령이 없다).
set -eu
SRC_DIR="${1:-$HOME/Downloads/무제_폴더_6}"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/world/corridor"
GLTF="${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli}"
mkdir -p "$OUT_DIR"

# 한글원본 | 영문id | 목표 삼각형 수(k) | 텍스처 한 변(px) | simplify 오차(0.001 = 형태 보존, 0.01 = 잎처럼 뭉개져도 되는 것)
TABLE='
세로_골드_몰딩|gold_molding_vertical|4|256|0.001
가로_골드_몰딩|gold_molding_horizontal|4|256|0.001
검정_대리석_기둥|black_marble_column|16|1024|0.001
리브드_우드_패널|ribbed_wood_panel|6|512|0.002
블랙_마블_벽_패널|black_marble_wall_panel|8|1024|0.001
스크린_패널|screen_panel|4|512|0.001
하단_벽_벤치선반|wall_bench_shelf|8|512|0.001
LED_라이트_바|led_light_bar|1|4|0.005
벽등_본체|wall_sconce|12|256|0.001
바닥_타일_1장|floor_tile|0.5|1024|0.005
바닥_테두리_몰딩|floor_edge_molding|1|4|0.005
화분_박스만|planter_box|6|512|0.001
식물_A|plant_a|20|512|0.01
식물_B|plant_b|20|512|0.01
식물_C|plant_c|20|512|0.01
식물_업라이트|plant_uplight|3|256|0.01
천장_슬랫_패널|ceiling_slat_panel|4|512|0.002
천장_간접조명_바|ceiling_cove_light|1|4|0.005
벽_코너_기둥|wall_corner_column|12|512|0.001
낮은_걸레받이Baseboard|baseboard|2|256|0.001
'
# 스크린_프레임(screen_frame)·아트패널_프레임만(art_panel_frame) 은 이 표에서 뺐다 — Tripo 의 금박 테 대신
# tools/brass-frame-glb.py 가 얇은 브라스 테를 직접 짠다. 다시 돌려도 그 두 파일은 덮어쓰지 않는다.

convert() {
  ko="$1"; en="$2"; ktri="$3"; tex="$4"; err="$5"
  src="$SRC_DIR/$ko.glb"; out="$OUT_DIR/$en.glb"; tmp="$(mktemp -d)"
  # 원본 삼각형 수를 GLB JSON 청크에서 읽어 비율을 계산한다
  tri=$(node -e '
    const fs=require("fs");const fd=fs.openSync(process.argv[1],"r");const h=Buffer.alloc(20);fs.readSync(fd,h,0,20,0);
    const len=h.readUInt32LE(12);const b=Buffer.alloc(len);fs.readSync(fd,b,0,len,20);const j=JSON.parse(b.toString());
    let t=0;for(const m of j.meshes)for(const p of m.primitives)t+=(p.indices!==undefined?j.accessors[p.indices].count:j.accessors[p.attributes.POSITION].count)/3;
    console.log(Math.round(t));' "$src")
  ratio=$(node -e "console.log(Math.min(1, ($ktri*1000)/$tri).toFixed(5))")
  echo "[$en] $ko  tri=$tri → ratio=$ratio  tex=${tex}²  err=$err"
  $GLTF weld "$src" "$tmp/a.glb" >/dev/null
  $GLTF simplify --ratio "$ratio" --error "$err" "$tmp/a.glb" "$tmp/b.glb" >/dev/null
  $GLTF resize --width "$tex" --height "$tex" "$tmp/b.glb" "$tmp/c.glb" >/dev/null
  $GLTF meshopt --level medium "$tmp/c.glb" "$out" >/dev/null
  rm -rf "$tmp"
  ls -la "$out"
}

# 4개씩 병렬
echo "$TABLE" | grep -v '^$' | while IFS='|' read -r ko en ktri tex err; do
  convert "$ko" "$en" "$ktri" "$tex" "$err" &
  while [ "$(jobs -r | wc -l)" -ge 4 ]; do sleep 1; done
done
wait
echo DONE
ls -la "$OUT_DIR"
