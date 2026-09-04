#!/usr/bin/env python3
"""
브라스 프레임 GLB 생성기 — **아트패널 프레임만**(art_panel_frame) · **스크린 프레임**(screen_frame) · **청동 문**(bronze_door).

원래는 둘 다 Tripo 가 만든 두꺼운 금박 테였다 (corridor-glb.sh 표에서 뺐다). 참고 이미지의 테는 손가락 굵기의
브라스 선 하나뿐이라, Tripo 부품 대신 여기서 **박스 4개(+ 검정 뒷판)** 로 직접 짠다. 의존성 없음 — python3 표준 라이브러리만.

    python3 tools/brass-frame-glb.py      → public/world/corridor/art_panel_frame.glb · screen_frame.glb · bronze_door.glb

부품 약속 (src/world/map/corridor/part.tsx): 발밑 y=0 · x,z 가운데 0 · 최대 변 0.98. 실제 치수는 조립자가 fit 으로 축마다 맞춘다.
  - 아트패널 프레임만: 0.75(x) × 0.98(y) × 0.12(z). 구멍 0.67×0.90 — 캔버스 Plane(바깥의 90%×93%)이 테 뒤로 살짝 물린다.
    검정 뒷판은 z 뒤쪽 1/4 두께만 — 캔버스(z = depth×0.4)보다 뒤라 화면을 가리지 않는다.
  - 스크린 프레임: 0.98(x) × 0.62(y) × 0.12(z). 구멍 95.9%×93.5% — screen.tsx 의 Screen 이 "구멍 96%×93.5%" 로 알고
    패널 몸체(97%×95.5%)를 뒤에 넣는다. 뒷판 없음 (패널 몸체가 그 자리다).
  - 청동 문: 0.80(x) × 0.98(y) × 0.12(z). 브라스 문틀(옆·위, 문지방 없음) 안에 어두운 청동 문짝 두 장이 뒤로 물러나 있고
    (문틀 깊이의 뒤 35%), 가운데 이음매 양쪽에 가는 브라스 선. 참고 이미지 복도 끝의 문 — 열리지 않는다 (충돌은 끝벽이 막는다).
"""

import json
import struct
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "world" / "corridor"

# 참고 이미지의 테는 노란 금이 아니라 어두운 청동이다 — 정면에서 빛을 받아도 금판처럼 뜨지 않게 낮춘 값
BRASS = {"baseColorFactor": [0.60, 0.44, 0.23, 1.0], "metallicFactor": 1.0, "roughnessFactor": 0.42}
BLACK = {"baseColorFactor": [0.02, 0.018, 0.015, 1.0], "metallicFactor": 0.0, "roughnessFactor": 0.92}
# 문짝 — 테보다 훨씬 어두운 청동. 정면 광원을 받아도 문틀보다 가라앉아 "안으로 들어간 문"으로 읽힌다
BRONZE = {"baseColorFactor": [0.22, 0.16, 0.10, 1.0], "metallicFactor": 0.9, "roughnessFactor": 0.5}


def box(x0, y0, z0, x1, y1, z1):
    """축 정렬 박스 → (positions, normals, indices). 면마다 꼭짓점을 따로 두어 법선이 날카롭다."""
    faces = [
        ((1, 0, 0), [(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)]),
        ((-1, 0, 0), [(x0, y0, z1), (x0, y1, z1), (x0, y1, z0), (x0, y0, z0)]),
        ((0, 1, 0), [(x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0)]),
        ((0, -1, 0), [(x0, y0, z1), (x0, y0, z0), (x1, y0, z0), (x1, y0, z1)]),
        ((0, 0, 1), [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]),
        ((0, 0, -1), [(x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)]),
    ]
    pos, nor, idx = [], [], []
    for n, quad in faces:
        base = len(pos)
        pos.extend(quad)
        nor.extend([n] * 4)
        idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])
    return pos, nor, idx


def merge(boxes):
    pos, nor, idx = [], [], []
    for b in boxes:
        p, n, i = box(*b)
        off = len(pos)
        pos.extend(p)
        nor.extend(n)
        idx.extend(j + off for j in i)
    return pos, nor, idx


def frame_parts(w, h, d, bar, plate):
    """테 4개 (+ 뒷판). 반환: [(정점들, 법선들, 색인들), ...] 재질 순서 = BRASS, BLACK"""
    hx, hz = w / 2, d / 2
    frame = merge([
        (-hx, 0, -hz, -hx + bar, h, hz),  # 왼쪽 세로
        (hx - bar, 0, -hz, hx, h, hz),  # 오른쪽 세로
        (-hx + bar, h - bar, -hz, hx - bar, h, hz),  # 위
        (-hx + bar, 0, -hz, hx - bar, bar, hz),  # 아래
    ])
    parts = [frame]
    if plate:
        parts.append(merge([(-hx + bar, bar, -hz, hx - bar, h - bar, -hz + d / 4)]))
    return parts


def door_parts(w, h, d, bar, gap=0.004, seam=0.006):
    """문틀(브라스) + 문짝 두 장(청동) + 가운데 이음매 브라스 선. 반환 순서 = BRASS, BRONZE"""
    hx, hz = w / 2, d / 2
    leaf_front = -hz + d * 0.35  # 문짝 앞면 — 문틀 앞면보다 뒤
    frame = merge([
        (-hx, 0, -hz, -hx + bar, h, hz),  # 왼쪽 문설주
        (hx - bar, 0, -hz, hx, h, hz),  # 오른쪽 문설주
        (-hx + bar, h - bar, -hz, hx - bar, h, hz),  # 상인방
        (-gap / 2 - seam, 0, leaf_front, -gap / 2, h - bar, leaf_front + 0.004),  # 이음매 브라스 선 (왼쪽 문짝 가장자리)
        (gap / 2, 0, leaf_front, gap / 2 + seam, h - bar, leaf_front + 0.004),  # 이음매 브라스 선 (오른쪽)
    ])
    leaves = merge([
        (-hx + bar, 0, -hz, -gap / 2, h - bar, leaf_front),
        (gap / 2, 0, -hz, hx - bar, h - bar, leaf_front),
    ])
    return [frame, leaves]


def pack_f32(v3s):
    return b"".join(struct.pack("<fff", *v) for v in v3s)


def pack_u16(ints):
    return b"".join(struct.pack("<H", i) for i in ints)


def bounds(v3s):
    xs, ys, zs = zip(*v3s)
    return [min(xs), min(ys), min(zs)], [max(xs), max(ys), max(zs)]


def write_glb(name, parts, materials):
    blobs, views, accessors, primitives = [], [], [], []
    offset = 0

    def add_view(data):
        nonlocal offset
        pad = (-len(data)) % 4
        blobs.append(data + b"\0" * pad)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data)})
        offset += len(data) + pad
        return len(views) - 1

    for mat_index, (pos, nor, idx) in enumerate(parts):
        mn, mx = bounds(pos)
        p = add_view(pack_f32(pos))
        n = add_view(pack_f32(nor))
        i = add_view(pack_u16(idx))
        accessors.append({"bufferView": p, "componentType": 5126, "count": len(pos), "type": "VEC3", "min": mn, "max": mx})
        accessors.append({"bufferView": n, "componentType": 5126, "count": len(nor), "type": "VEC3"})
        accessors.append({"bufferView": i, "componentType": 5123, "count": len(idx), "type": "SCALAR"})
        a = len(accessors) - 3
        primitives.append({"attributes": {"POSITION": a, "NORMAL": a + 1}, "indices": a + 2, "material": mat_index})

    gltf = {
        "asset": {"version": "2.0", "generator": "who-is-human tools/brass-frame-glb.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": name}],
        "meshes": [{"name": name, "primitives": primitives}],
        "materials": [{"name": n, "pbrMetallicRoughness": m} for n, m in materials][: len(parts)],
        "buffers": [{"byteLength": offset}],
        "bufferViews": views,
        "accessors": accessors,
    }

    json_bytes = json.dumps(gltf, separators=(",", ":")).encode()
    json_bytes += b" " * ((-len(json_bytes)) % 4)
    bin_bytes = b"".join(blobs)
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    out = OUT_DIR / f"{name}.glb"
    with out.open("wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes)
        f.write(struct.pack("<II", len(bin_bytes), 0x004E4942) + bin_bytes)
    tri = sum(len(p[2]) for p in parts) // 3
    print(f"{out.name}  {total} bytes  tri={tri}")


# 이름 | 바깥 치수 (x, y, z) | 테 굵기 | 검정 뒷판
FRAMES = [
    ("art_panel_frame", (0.75, 0.98, 0.12), 0.04, True),  # 1.6m 액자에서 테 8.5cm
    ("screen_frame", (0.98, 0.62, 0.12), 0.02, False),  # 6m 포털에서 테 12cm·11cm — 참고 이미지의 가는 문틀
]

for name, (w, h, d), bar, plate in FRAMES:
    write_glb(name, frame_parts(w, h, d, bar, plate), [("brass", BRASS), ("backing", BLACK)])

# 청동 문 — 2.6m × 3.2m 문에서 문틀 6.5cm
write_glb("bronze_door", door_parts(0.80, 0.98, 0.12, 0.02), [("brass", BRASS), ("bronze", BRONZE)])
