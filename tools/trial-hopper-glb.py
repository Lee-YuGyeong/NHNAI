#!/usr/bin/env python3
"""
천장 배출 호퍼 GLB 생성기 — 낙하 생존(features/trial/games/fall)의 공 배출구.

공이 y=11.5 허공에서 갑자기 나타나는 게 별로라(2026-09-04 사용자), 마당 위를 호퍼 격자로 덮어
"천장 기계에서 나온다"로 읽히게 한다. Tripo 크레딧이 0 이라 brass-frame-glb.py 방식으로 직접 짠다 —
의존성 없음, python3 표준 라이브러리만.

    python3 tools/trial-hopper-glb.py      → public/world/trial/trial_hopper.glb

부품 약속 (src/world/map/corridor/part.tsx): 발밑 y=0 · x,z 가운데 0 · 최대 변 0.98.
★ 프리미티브 **하나** + 정점색(COLOR_0) — GlbInstances(첫 메시의 geometry·material 만 쓴다)로
  격자 전체가 드로우콜 하나가 되게. 그래서 재질 대신 정점색으로 칠한다.

생김새 (거꾸로 선 사다리꼴 깔때기, 아래가 배출구):
  - 윗판(플랜지) 0.98×0.98 — 천장에 박힌 마운트. 격자로 깔면 서로 닿아 한 대의 기계처럼 읽힌다.
  - 경사판 4장: 위 0.94 → 아래 0.52 로 좁아진다. 바깥은 건메탈, **안쪽은 근흑(VOID)** —
    안이 어두워야 배출구 속에서 공이 스르륵 나타나는 게 안 보인다 (천장 점광은 벽을 뚫으므로 알베도로 죽인다).
  - 배출구 칼라(0.52, 높이 0.10): 노랑·검정 위험 줄무늬 띠 + 맨 아래 앰버 립 —
    11m 아래 3인칭 카메라에서 배출구 위치가 읽히는 유일한 색이다.
"""

import json
import struct
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "world" / "trial"

# 정점색 (리니어). 건메탈은 맵의 DARK_STEEL 톤, VOID 는 조명을 먹어도 검게 남을 만큼 낮다
STEEL = (0.115, 0.125, 0.145)
VOID = (0.006, 0.006, 0.008)
YELLOW = (0.75, 0.55, 0.04)
STRIPE_DARK = (0.02, 0.02, 0.022)
AMBER = (1.0, 0.42, 0.08)

# 치수 (모델 단위 — fit 이 실제 m 를 정한다)
TOP_W = 0.98  # 플랜지 한 변
SLOPE_TOP = 0.94  # 경사부 윗변
MOUTH = 0.52  # 배출구 바깥 변
INNER = 0.46  # 배출구 안 변
COLLAR_H = 0.10
SLOPE_Y1 = 0.56  # 경사부 윗변 높이 = 플랜지 아랫면
FLANGE_T = 0.06

pos, nor, col, idx = [], [], [], []


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _norm(v):
    l = max((v[0] ** 2 + v[1] ** 2 + v[2] ** 2) ** 0.5, 1e-9)
    return (v[0] / l, v[1] / l, v[2] / l)


def quad(p0, p1, p2, p3, color):
    """꼭짓점 4개(반시계 = 앞면) → 삼각형 둘. 법선은 면에서 계산한다"""
    n = _norm(_cross((p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), (p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2])))
    base = len(pos)
    pos.extend([p0, p1, p2, p3])
    nor.extend([n] * 4)
    col.extend([color] * 4)
    idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])


def box(x0, y0, z0, x1, y1, z1, color):
    quad((x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1), color)
    quad((x0, y0, z1), (x0, y1, z1), (x0, y1, z0), (x0, y0, z0), color)
    quad((x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0), color)
    quad((x0, y0, z1), (x0, y0, z0), (x1, y0, z0), (x1, y0, z1), color)
    quad((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1), color)
    quad((x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0), color)


def pyramid_ring(w0, y0, w1, y1, color, inward=False):
    """정사각 w0(높이 y0) → w1(높이 y1) 을 잇는 경사판 4장. inward 면 법선이 안을 본다"""
    a0, a1 = w0 / 2, w1 / 2
    corners0 = [(-a0, y0, -a0), (a0, y0, -a0), (a0, y0, a0), (-a0, y0, a0)]
    corners1 = [(-a1, y1, -a1), (a1, y1, -a1), (a1, y1, a1), (-a1, y1, a1)]
    for i in range(4):
        j = (i + 1) % 4
        if inward:
            quad(corners0[j], corners1[j], corners1[i], corners0[i], color)
        else:
            quad(corners0[i], corners1[i], corners1[j], corners0[j], color)


# ── 플랜지 (천장 마운트) ──
box(-TOP_W / 2, SLOPE_Y1, -TOP_W / 2, TOP_W / 2, SLOPE_Y1 + FLANGE_T, TOP_W / 2, STEEL)
# 안쪽 천장 — 배출구로 올려다보면 근흑. 경사부 안벽 윗변(0.88)을 덮는다. 법선이 **아래(-y)** 를 봐야 마당에서 보인다
quad((-0.44, SLOPE_Y1 - 0.005, -0.44), (0.44, SLOPE_Y1 - 0.005, -0.44), (0.44, SLOPE_Y1 - 0.005, 0.44), (-0.44, SLOPE_Y1 - 0.005, 0.44), VOID)

# ── 경사부 — 바깥 건메탈 · 안 근흑 ──
pyramid_ring(MOUTH, COLLAR_H, SLOPE_TOP, SLOPE_Y1, STEEL)
pyramid_ring(INNER, COLLAR_H, 0.88, SLOPE_Y1 - 0.005, VOID, inward=True)

# ── 배출구 칼라 — 링 박스 4개 ──
ho, hi = MOUTH / 2, INNER / 2
box(-ho, 0, hi, ho, COLLAR_H, ho, STEEL)  # +z
box(-ho, 0, -ho, ho, COLLAR_H, -hi, STEEL)  # -z
box(hi, 0, -hi, ho, COLLAR_H, hi, STEEL)  # +x
box(-ho, 0, -hi, -hi, COLLAR_H, hi, STEEL)  # -x

# ── 위험 줄무늬 — 칼라 바깥 네 면에 7분할 노랑/검정 (살짝 돌출) ──
SEGS = 7
seg = MOUTH / SEGS
for i in range(SEGS):
    c = YELLOW if i % 2 == 0 else STRIPE_DARK
    a, b = -ho + i * seg, -ho + (i + 1) * seg
    box(a, 0.022, ho, b, COLLAR_H - 0.012, ho + 0.007, c)  # +z 면
    box(a, 0.022, -ho - 0.007, b, COLLAR_H - 0.012, -ho, c)  # -z 면
    box(ho, 0.022, a, ho + 0.007, COLLAR_H - 0.012, b, c)  # +x 면
    box(-ho - 0.007, 0.022, a, -ho, COLLAR_H - 0.012, b, c)  # -x 면

# ── 앰버 립 — 배출구 맨 아래 테. 아랫면이 11m 아래에서 보이는 면이다 ──
LIP = 0.016
lo = ho + 0.010
box(-lo, 0, ho - 0.010, lo, LIP, lo, AMBER)  # +z
box(-lo, 0, -lo, lo, LIP, -ho + 0.010, AMBER)  # -z
box(ho - 0.010, 0, -ho + 0.010, lo, LIP, ho - 0.010, AMBER)  # +x
box(-lo, 0, -ho + 0.010, -ho + 0.010, LIP, ho - 0.010, AMBER)  # -x


def pack_f32(v3s):
    return b"".join(struct.pack("<fff", *v) for v in v3s)


def pack_u16(ints):
    return b"".join(struct.pack("<H", i) for i in ints)


mn = [min(v[i] for v in pos) for i in range(3)]
mx = [max(v[i] for v in pos) for i in range(3)]

blobs, views = [], []
offset = 0


def add_view(data):
    global offset
    pad = (-len(data)) % 4
    blobs.append(data + b"\0" * pad)
    views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data)})
    offset += len(data) + pad
    return len(views) - 1


p = add_view(pack_f32(pos))
n = add_view(pack_f32(nor))
c = add_view(pack_f32(col))
i = add_view(pack_u16(idx))

gltf = {
    "asset": {"version": "2.0", "generator": "who-is-human tools/trial-hopper-glb.py"},
    "scene": 0,
    "scenes": [{"nodes": [0]}],
    "nodes": [{"mesh": 0, "name": "trial_hopper"}],
    "meshes": [{"name": "trial_hopper", "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "COLOR_0": 2}, "indices": 3, "material": 0}]}],
    "materials": [{"name": "hopper", "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0.65, "roughnessFactor": 0.55}}],
    "accessors": [
        {"bufferView": p, "componentType": 5126, "count": len(pos), "type": "VEC3", "min": mn, "max": mx},
        {"bufferView": n, "componentType": 5126, "count": len(nor), "type": "VEC3"},
        {"bufferView": c, "componentType": 5126, "count": len(col), "type": "VEC3"},
        {"bufferView": i, "componentType": 5123, "count": len(idx), "type": "SCALAR"},
    ],
    "buffers": [{"byteLength": offset}],
    "bufferViews": views,
}

json_bytes = json.dumps(gltf, separators=(",", ":")).encode()
json_bytes += b" " * ((-len(json_bytes)) % 4)
bin_bytes = b"".join(blobs)
total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
OUT_DIR.mkdir(parents=True, exist_ok=True)
out = OUT_DIR / "trial_hopper.glb"
with out.open("wb") as f:
    f.write(struct.pack("<III", 0x46546C67, 2, total))
    f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes)
    f.write(struct.pack("<II", len(bin_bytes), 0x004E4942) + bin_bytes)
print(f"{out.name}  {total} bytes  tri={len(idx) // 3}  bounds={mn}~{mx}")
