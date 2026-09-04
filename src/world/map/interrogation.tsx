/**
 * 3D 디지털 심문소 — 3D 월드의 세 번째 배경. 검정 철골 트러스 천장, 검푸른 강판 벽, 무광 검정 타일 바닥 위 청색 발광 격자선,
 * 끝벽의 낮은 단(앞면 발광 띠·윗면 원형 표식)과 그 위 링 조명(빈 무대에 빛만 떨어진다), 단 뒤 관찰창·모니터·세로 LED 바,
 * 옆벽 X 가새 문과 금속 케이스 선반, 등 뒤 벽의 격벽 링·격납문 (참고 이미지 그대로).
 *
 * 부품:
 *   - GLB: 금속 랙·링 조명 기구·금속 케이스(Tripo, public/world/interrogation/) · 트러스·H 기둥·X 가새는 창고 부품을 tint 해 재사용
 *          · 등 뒤 벽의 격벽 링·격납문은 복도 부품(sci_bulkhead·sci_blast_door)을 useShapedMaterial 로 재사용.
 *   - 텍스처 5장(힉스필드 Seedream → sharp)은 public/textures/interrogation/ — 바닥 타일·강판 벽·모니터 화면·관찰창 안쪽·천장 강판.
 *   - 빛나는 것(격자선·LED 띠·세로 바·링)은 전부 emissive(toneMapped=false) 단위 박스 인스턴스 — 실제 광원은 Lights 가 8개만 쥔다.
 *
 * 구조:
 *   - 치수·배치·충돌은 전부 interrogation/layout.ts (여기는 그 숫자로 부품을 늘어놓기만 한다).
 *   - 공용 헬퍼(Instanced·Parts·useTiled)는 map/parts.tsx — 창고 맵과 같다.
 *   - 그림자를 드리우는 것이 전부 정적이라 그림자맵은 **한 번만 굽는다** (StaticShadows).
 *
 * 여기에는 **씬만 있다.** 캔버스·카메라·이동·네트워크는 scene/WorldScene.tsx 가 쥔다. 맵 선택은 map/index.ts 의 MAPS.
 */

import { MeshReflectorMaterial, useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { groundHeightAt as groundHeightWith, resolveCollisions } from '../mp/collide';
import type { QualityTier } from '../perf/quality';
import { Bloom } from '../scene/Bloom';
import { type Fit, type InstanceItem } from './corridor/part';
import { Instanced, Parts, useTiled, type Item } from './parts';
import { useShapedMaterial } from './scifi';
import {
  BRACE_BAYS,
  BULKHEAD,
  CASE,
  COLLIDERS,
  COLUMN,
  COLUMN_ZS,
  DEPTH,
  DOOR,
  DOOR_LIGHT,
  END_LIGHT_COLUMN_XS,
  FOCUS,
  GRATE,
  GRID_ZS,
  HALF_W,
  LIGHT_COLUMN,
  MID_Z,
  PURLIN_TS,
  RACK,
  RACKS,
  RING,
  RISE,
  ROOM,
  SCREENS,
  SHELF_CASES,
  SLOPE_ANGLE,
  SLOPE_LEN,
  SPOT,
  STAGE,
  STAGE_FRONT_Z,
  STAGE_MARK,
  STAGE_STRIP,
  STAGE_Z,
  STRIP,
  TILE,
  TRUSS,
  TRUSS_ZS,
  WALL_STRIP_YS,
  WINDOW,
  type RackPlace,
} from './interrogation/layout';

export { FOCUS as INTERROGATION_FOCUS };

const TEX = {
  floor: '/textures/interrogation/floor.webp',
  wall: '/textures/interrogation/wall.webp',
  screen: '/textures/interrogation/screen.webp',
  window: '/textures/interrogation/window.webp',
  roof: '/textures/interrogation/roof.webp',
};
useTexture.preload([TEX.floor, TEX.wall, TEX.screen, TEX.window, TEX.roof]);

/* ─────────────────────────────── 재질 (모듈 수준, 공유) ─────────────────────────────── */

/**
 * 발광 재질 — 참고 렌더의 청색. high 에서는 블룸(Bloom.tsx)이 걸리므로 color 를 1 보다 크게(HDR) 잡아 번지게 한다.
 * 등급: 링 RING > 벽 띠·세로 바 STRIP. 전부 최대 밝기면 난잡해진다. (바닥 격자선은 뺐다 — 타일 줄눈만) 주황 점(WARM)은 참고 이미지의 랙·패널 표시등.
 */
const hdr = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k);
// ★ ACES 는 1 을 넘는 채색광을 흰색으로 탈색시킨다 — 배율은 1 근처로 두고 글로우는 블룸 문턱을 낮춰 얻는다
const STRIP_MAT = new THREE.MeshBasicMaterial({ color: hdr('#1f7fc4', 0.9), toneMapped: false });
const RING_MAT = new THREE.MeshBasicMaterial({ color: hdr('#dceeff', 2.2), toneMapped: false });
const WARM_MAT = new THREE.MeshBasicMaterial({ color: hdr('#ff9a3a', 1.25), toneMapped: false });
/** 배수구 살 — 격자선보다 훨씬 낮은 청색 (블룸 문턱 아래) */
const SLOT_MAT = new THREE.MeshBasicMaterial({ color: hdr('#1f6a9c', 0.6), toneMapped: false });
const GRATE_MAT = new THREE.MeshStandardMaterial({ color: '#0a0d12', roughness: 0.7, metalness: 0.5 });
/** 어두운 강재 — 빔·프레임·베젤 */
const STEEL_MAT = new THREE.MeshStandardMaterial({ color: '#3a4350', roughness: 0.55, metalness: 0.5 });
const STAGE_MAT = new THREE.MeshStandardMaterial({ color: '#232a34', roughness: 0.45, metalness: 0.35 });
/** X 가새 뒤의 강판 문 — 벽보다 조금 밝은 무광 */
const DOOR_MAT = new THREE.MeshStandardMaterial({ color: '#242b36', roughness: 0.7, metalness: 0.3 });
/** 링 조명의 빛기둥 — 가산 혼합의 반투명 원뿔 (참고 이미지의 안개 속 광선) */
const BEAM_MAT = new THREE.MeshBasicMaterial({ color: '#9fd0ff', transparent: true, opacity: 0.03, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

/** 광원 색 — 링 조명은 차가운 흰색, 벽 빛은 청색 */
const KEY_COLOR = '#dfeeff';
const BLUE_COLOR = '#4aa8ff';
/** 창고 GLB 부품을 검푸르게 가라앉히는 tint */
const DARK_STEEL_TINT = '#aab3c0';
/** X 가새는 벽에서 읽히게 더 밝게 */
const BRACE_TINT = '#a0a9b5';

/* ─────────────────────────────── 배치 (모듈 수준 상수) ─────────────────────────────── */

/* ── 바닥 배수구 ── */
/** 옆벽 앞 배수구 — 검정 틀 + 살 3개(어두운 청색) */
const GRATE_FRAMES: Item[] = GRID_ZS.flatMap((z) => [-1, 1].map((s): Item => ({ position: [s * GRATE.x, GRATE.h / 2, z], scale: [GRATE.d, GRATE.h, GRATE.w] })));
const GRATE_SLOTS: Item[] = GRID_ZS.flatMap((z) => [-1, 1].flatMap((s) => [-0.1, 0, 0.1].map((dx): Item => ({ position: [s * GRATE.x + dx, GRATE.h + 0.004, z], scale: [0.03, 0.006, GRATE.w - 0.12] }))));

/* ── 벽 가장자리 LED 띠 — 옆벽 2 × 2단, 끝벽 2 × 2단 ── */
const WALL_STRIPS: Item[] = WALL_STRIP_YS.flatMap((y): Item[] => [
  { position: [-HALF_W + STRIP.d / 2, y, MID_Z], scale: [STRIP.d, STRIP.h, DEPTH] },
  { position: [HALF_W - STRIP.d / 2, y, MID_Z], scale: [STRIP.d, STRIP.h, DEPTH] },
  { position: [0, y, ROOM.back + STRIP.d / 2], scale: [ROOM.width, STRIP.h, STRIP.d] },
  { position: [0, y, ROOM.front - STRIP.d / 2], scale: [ROOM.width, STRIP.h, STRIP.d] },
]);

/* ── 세로 LED 바 패널 — 끝벽 창 바깥쪽 2 + 옆벽 X 가새 bay 양쪽 기둥 옆 ── */
interface ColumnPlace {
  x: number;
  z: number;
  /** 패널이 붙은 벽의 법선 방향으로 튀어나온다. 'z' 면 끝벽(패널 폭이 x), 'x' 면 옆벽(폭이 z) */
  wall: 'x' | 'z';
}
const LIGHT_COLUMNS: ColumnPlace[] = [
  ...END_LIGHT_COLUMN_XS.map((x): ColumnPlace => ({ x, z: ROOM.back + 0.08, wall: 'z' })),
  // 옆벽은 무대 쪽 두 bay(0·2)의 뒤쪽 기둥 옆에만 — 벽마다 다 세우면 바가 너무 많다
  ...[BRACE_BAYS[0], BRACE_BAYS[2]].flatMap(([z0]) => [-1, 1].map((s): ColumnPlace => ({ x: s * (HALF_W - 0.08), z: z0 + 0.95, wall: 'x' }))),
];
const COLUMN_PANEL_H = LIGHT_COLUMN.y1 - LIGHT_COLUMN.y0 + 0.5;
const LIGHT_COLUMN_PANELS: Item[] = LIGHT_COLUMNS.map((c): Item => ({
  position: [c.x, (LIGHT_COLUMN.y0 + LIGHT_COLUMN.y1) / 2, c.z],
  scale: c.wall === 'z' ? [LIGHT_COLUMN.w, COLUMN_PANEL_H, 0.16] : [0.16, COLUMN_PANEL_H, LIGHT_COLUMN.w],
}));
const LIGHT_COLUMN_BARS: Item[] = LIGHT_COLUMNS.flatMap((c) => {
  const segH = (LIGHT_COLUMN.y1 - LIGHT_COLUMN.y0 - LIGHT_COLUMN.gap * (LIGHT_COLUMN.segs - 1)) / LIGHT_COLUMN.segs;
  const items: Item[] = [];
  for (let b = 0; b < LIGHT_COLUMN.bars; b++) {
    const off = (b - (LIGHT_COLUMN.bars - 1) / 2) * (LIGHT_COLUMN.w / LIGHT_COLUMN.bars);
    for (let s = 0; s < LIGHT_COLUMN.segs; s++) {
      const y = LIGHT_COLUMN.y0 + segH / 2 + s * (segH + LIGHT_COLUMN.gap);
      items.push(
        c.wall === 'z'
          ? { position: [c.x + off, y, c.z + 0.09], scale: [LIGHT_COLUMN.barW, segH, 0.02] }
          : { position: [c.x - Math.sign(c.x) * 0.09, y, c.z + off], scale: [0.02, segH, LIGHT_COLUMN.barW] },
      );
    }
  }
  return items;
});

/* ── 모니터 2×2 × 양쪽 — 화면(텍스처 평면)과 베젤(검정 박스) ── */
const SCREEN_ITEMS: { x: number; y: number }[] = [-1, 1].flatMap((s) =>
  [-1, 1].flatMap((cx) => [-1, 1].map((cy) => ({ x: s * SCREENS.cx + cx * (SCREENS.w + SCREENS.gapX) / 2, y: SCREENS.y + cy * (SCREENS.h + SCREENS.gapY) / 2 }))),
);
/** 베젤 상자 앞면(z −19.88)보다 화면을 1cm 앞에 — 같은 면이면 z-fighting 으로 화면이 군데군데 꺼진다 */
const BEZEL_Z = ROOM.back + 0.08;
const SCREEN_Z = BEZEL_Z + 0.04 + 0.01;
const BEZELS: Item[] = SCREEN_ITEMS.map((it): Item => ({ position: [it.x, it.y, BEZEL_Z], scale: [SCREENS.w + 0.12, SCREENS.h + 0.12, 0.08] }));

/* ── 관찰창 — 8각 프레임·유리 형상 ── */
const WIN_CY = WINDOW.y + WINDOW.h / 2;
/** 네 모서리를 c 만큼 깎은 직사각형 (중심 원점, XY 평면) */
function chamferedRect(w: number, h: number, c: number): THREE.Shape {
  const x = w / 2;
  const y = h / 2;
  const sh = new THREE.Shape();
  sh.moveTo(-x + c, -y);
  sh.lineTo(x - c, -y);
  sh.lineTo(x, -y + c);
  sh.lineTo(x, y - c);
  sh.lineTo(x - c, y);
  sh.lineTo(-x + c, y);
  sh.lineTo(-x, y - c);
  sh.lineTo(-x, -y + c);
  sh.closePath();
  return sh;
}
/** 프레임 = 바깥 8각 − 안쪽 8각, 벽에서 depth 만큼 돌출, 모서리 베벨 */
const WINDOW_FRAME_GEO = (() => {
  const outer = chamferedRect(WINDOW.w + WINDOW.frame * 2, WINDOW.h + WINDOW.frame * 2, WINDOW.chamfer + WINDOW.frame * 0.4);
  outer.holes.push(chamferedRect(WINDOW.w, WINDOW.h, WINDOW.chamfer));
  const g = new THREE.ExtrudeGeometry(outer, { depth: WINDOW.depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
  g.computeVertexNormals();
  return g;
})();
/** 프레임 안쪽 턱 — 유리 둘레의 얇은 밝은 테 (참고 렌더의 안쪽 립) */
const WINDOW_LIP_GEO = (() => {
  const outer = chamferedRect(WINDOW.w + 0.12, WINDOW.h + 0.12, WINDOW.chamfer + 0.05);
  outer.holes.push(chamferedRect(WINDOW.w - 0.02, WINDOW.h - 0.02, WINDOW.chamfer - 0.01));
  return new THREE.ExtrudeGeometry(outer, { depth: 0.06, bevelEnabled: false });
})();
/** 유리 — ShapeGeometry 의 UV 는 월드 좌표라 이미지가 가운데 1m 에만 맺힌다. 바운딩 박스 기준 0~1 로 다시 편다 */
const WINDOW_GLASS_GEO = (() => {
  const g = new THREE.ShapeGeometry(chamferedRect(WINDOW.w, WINDOW.h, WINDOW.chamfer));
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / WINDOW.w + 0.5, pos.getY(i) / WINDOW.h + 0.5);
  uv.needsUpdate = true;
  return g;
})();
const FRAME_MAT = new THREE.MeshStandardMaterial({ color: '#39424f', roughness: 0.45, metalness: 0.65 });
const LIP_MAT = new THREE.MeshStandardMaterial({ color: '#6c7686', roughness: 0.35, metalness: 0.8 });

/* ── 철골 (창고 GLB) ── */
const TRUSS_FIT: Fit = { x: TRUSS.thickness, y: RISE, z: ROOM.width };
const TRUSSES: InstanceItem[] = TRUSS_ZS.map((z) => ({ position: [0, ROOM.eave - 0.05, z], rotationY: Math.PI / 2 }));
const PURLINS: Item[] = [
  ...PURLIN_TS.flatMap((t) =>
    [-1, 1].map((s): Item => ({
      position: [s * HALF_W * (1 - t), ROOM.eave + RISE * t - 0.1, MID_Z],
      scale: [0.14, 0.14, DEPTH],
      rotation: [0, 0, -s * SLOPE_ANGLE],
    })),
  ),
  { position: [0, ROOM.ridge - 0.12, MID_Z], scale: [0.16, 0.2, DEPTH] },
  // 처마 높이 가로 빔 — 링 조명이 여기서 내려온다. 끝벽 헤더 빔도 하나
  { position: [0, RING.beamY, SPOT.z], scale: [ROOM.width, 0.3, 0.3] },
  { position: [0, ROOM.eave - 0.1, ROOM.back + 0.25], scale: [ROOM.width, 0.4, 0.5] },
];
const COLUMN_FIT: Fit = { x: COLUMN.d, y: ROOM.eave, z: COLUMN.w };
const COLUMN_X = HALF_W - COLUMN.d / 2;
const COLUMN_ITEMS: InstanceItem[] = COLUMN_ZS.flatMap((z) => [-1, 1].map((s): InstanceItem => ({ position: [s * COLUMN_X, 0, z], rotationY: s < 0 ? 0 : Math.PI })));
/** X 가새 문 — bay 전체를 덮는 강판(검정 박스) 위에 가새 GLB */
const BRACE_FIT: Fit = { x: 0.14, y: ROOM.eave - 1.6, z: BRACE_BAYS[0][1] - BRACE_BAYS[0][0] - 2.2 };
const BRACE_X = HALF_W - 0.1;
const BRACE_ITEMS: InstanceItem[] = BRACE_BAYS.flatMap(([z0, z1]) =>
  [-1, 1].map((s): InstanceItem => ({ position: [s * BRACE_X, 0.6, (z0 + z1) / 2], rotationY: s < 0 ? 0 : Math.PI })),
);
const DOOR_PLATES: Item[] = BRACE_BAYS.flatMap(([z0, z1]) =>
  [-1, 1].map((s): Item => ({ position: [s * (HALF_W - 0.03), (ROOM.eave - 0.4) / 2 + 0.2, (z0 + z1) / 2], scale: [0.06, ROOM.eave - 1.0, z1 - z0 - 2.0] })),
);

/* ── 금속 랙 (GLB) · 선반 밑 LED · 금속 케이스 (GLB) ── */
function local(r: RackPlace, dx: number, y: number, dz: number): [number, number, number] {
  const c = Math.cos(r.rot);
  const s = Math.sin(r.rot);
  return [r.x + dx * c + dz * s, y, r.z - dx * s + dz * c];
}
const RACK_FIT: Fit = { x: RACK.d, y: RACK.h, z: RACK.w };
const RACK_ITEMS: InstanceItem[] = RACKS.map((r) => ({ position: [r.x, 0, r.z], rotationY: r.rot + Math.PI / 2 }));
const RACK_STRIPS: Item[] = RACKS.flatMap((r) =>
  [...RACK.shelfTops.slice(1), RACK.topBeam].map((t): Item => ({
    position: local(r, 0, RACK.h * t - 0.07 - STRIP.h / 2, RACK.d / 2 - 0.08),
    scale: [RACK.w - 0.3, STRIP.h, STRIP.d],
    rotation: [0, r.rot, 0],
  })),
);
/** 케이스 모델 폭 1 = 1m 이라 fit 은 항등, 크기는 item scale(w) 로. 발밑이 선반판 윗면 */
const CASE_FIT: Fit = { x: CASE.w, y: CASE.h, z: CASE.d };
const CASE_ITEMS: InstanceItem[] = RACKS.flatMap((r) =>
  RACK.shelfTops.flatMap((t, i) => SHELF_CASES[i].map((b): InstanceItem => ({ position: local(r, b.x, RACK.h * t + 0.01, 0.0), rotationY: r.rot, scale: b.w }))),
);

/** 랙 앞기둥의 주황 표시등 — 칸마다 하나, 앞쪽 기둥 두 개 중 안쪽(스폰 쪽) 하나에만 */
const RACK_DOTS: Item[] = RACKS.flatMap((r) =>
  RACK.shelfTops.map((t): Item => ({ position: local(r, -RACK.w / 2 + 0.12, RACK.h * t + 0.35, RACK.d / 2 - 0.02), scale: [0.05, 0.05, 0.02], rotation: [0, r.rot, 0] })),
);
/** 세로 바 패널 아래의 호박색 키패드 표시 */
const PANEL_DOTS: Item[] = LIGHT_COLUMNS.map((c): Item => ({
  position: c.wall === 'z' ? [c.x, LIGHT_COLUMN.y0 - 0.32, c.z + 0.09] : [c.x - Math.sign(c.x) * 0.09, LIGHT_COLUMN.y0 - 0.32, c.z],
  scale: c.wall === 'z' ? [0.16, 0.1, 0.02] : [0.02, 0.1, 0.16],
}));

/* ── 링 조명 기구 (GLB) — 모델은 링이 아래(y 0~0.09)·봉이 위. 발밑 = 링 밑면 ── */
const RING_FIT: Fit = { x: RING.r * 2 + 0.16 };
const RING_ITEM: InstanceItem[] = [{ position: [SPOT.x, RING.y - 0.1, SPOT.z] }];

/* ── 무대 앞면·옆면 발광 띠 · 윗면 원형 표식 (창고 맵과 같은 생각) ── */
/** 무광 검정 바닥에서 무대 턱이 안 읽혀 헛디딘다 — 앞면 하나 + 옆면 둘 */
const STAGE_STRIPS: Item[] = [
  { position: [0, STAGE_STRIP.y, STAGE_FRONT_Z + STAGE_STRIP.d / 2], scale: [STAGE.w - 0.4, STAGE_STRIP.h, STAGE_STRIP.d] },
  ...[-1, 1].map((s): Item => ({
    position: [s * (STAGE.w / 2 + STAGE_STRIP.d / 2), STAGE_STRIP.y, STAGE_Z + 0.2],
    scale: [STAGE_STRIP.d, STAGE_STRIP.h, STAGE.d - 0.4],
  })),
];

/* ── 등 뒤 벽 — 격벽 링 + 격납문 (복도·창고와 같은 부품·배율) ── */
/** sci_bulkhead 모델의 폭·높이 비 (창고 맵에서 잰 값) */
const BULKHEAD_MODEL = { w: 0.894, h: 1 } as const;
const BULKHEAD_FIT: Fit = { x: BULKHEAD.thickness, y: BULKHEAD_MODEL.h * BULKHEAD.scale, z: BULKHEAD_MODEL.w * BULKHEAD.scale };
const BULKHEAD_ITEMS: InstanceItem[] = [{ position: [0, -BULKHEAD.sink, ROOM.front - BULKHEAD.thickness / 2], rotationY: Math.PI / 2 }];
const BLAST_DOOR_FIT: Fit = { x: DOOR.depth, y: DOOR.h, z: DOOR.w };
const BLAST_DOOR_ITEMS: InstanceItem[] = [{ position: [0, 0, ROOM.front - DOOR.depth / 2 - 0.02], rotationY: Math.PI / 2 }];

/* ─────────────────────────────── 건물 ─────────────────────────────── */

export interface InterrogationProps {
  quality?: QualityTier;
}

export function Interrogation({ quality = 'high' }: InterrogationProps) {
  const [floor, wall, screen, windowTex, roof] = useTexture([TEX.floor, TEX.wall, TEX.screen, TEX.window, TEX.roof]);

  // 텍스처 한 장 = 타일 1개(줄눈 반쪽이 가장자리). 평면 원점이 벽 모서리라 줄눈이 -15·-20 부터 TILE 마다 — 격자선이 그 위에 앉는다. 미러 반복이면 줄눈이 겹치므로 일반 반복
  const floorTex = useTiled(floor, ROOM.width / TILE, DEPTH / TILE, false);
  // 강판 패널 한 장 ≈ 4.5m — 작게 반복하면 하이라이트가 타일처럼 읽힌다
  // 강판 텍스처(768×1024)는 패널 5장 폭 ≈ 6m · 세로 8m 로 — 미러 반복이라 이음매가 접혀 숨는다
  const sideTex = useTiled(wall, DEPTH / 6, ROOM.eave / 8);
  const endTex = useTiled(wall, ROOM.width / 6, ROOM.ridge / 8);
  const roofTex = useTiled(roof, SLOPE_LEN / 5, DEPTH / 5);

  const mats = useMemo(() => {
    const prep = (t: THREE.Texture) => {
      const c = t.clone();
      c.colorSpace = THREE.SRGBColorSpace;
      c.anisotropy = 8;
      c.needsUpdate = true;
      return c;
    };
    return {
      /** 화면은 스스로 빛난다 — 조명 무관 */
      screen: new THREE.MeshBasicMaterial({ map: prep(screen), color: hdr('#d9ecff', 1.1) }),
      /** 어두운 유리 너머 관제실 — ObservationWindow 가 반사 재질의 map 으로 쓴다 */
      windowMap: prep(windowTex),
    };
  }, [screen, windowTex]);
  useEffect(
    () => () => {
      mats.screen.map?.dispose();
      mats.screen.dispose();
      mats.windowMap.dispose();
    },
    [mats],
  );

  // Tripo 부품(격벽 링·격납문)은 알베도를 떼고 단색 강철에 노멀맵만 얹는다 — 창고·복도와 같은 처리
  const bulkheadMat = useShapedMaterial('sci_bulkhead');
  const blastDoorMat = useShapedMaterial('sci_blast_door');

  const shadows = quality !== 'low';

  return (
    <group name="심문소">
      <Floor map={floorTex} reflective={quality === 'high'} />
      <Instanced name="배수구" items={GRATE_FRAMES} material={GRATE_MAT} />
      <Instanced name="배수구 살" items={GRATE_SLOTS} material={SLOT_MAT} receiveShadow={false} />

      {/* 벽 — 검푸른 강판. 끝벽은 박공 삼각형까지 한 장(밖은 지붕이 가린다) */}
      <mesh name="무대벽" position={[0, ROOM.ridge / 2, ROOM.back]} receiveShadow>
        <planeGeometry args={[ROOM.width, ROOM.ridge]} />
        <meshStandardMaterial map={endTex} color="#ffffff" roughness={0.6} metalness={0.25} />
      </mesh>
      <mesh name="등 뒤 벽" position={[0, ROOM.ridge / 2, ROOM.front]} rotation-y={Math.PI} receiveShadow>
        <planeGeometry args={[ROOM.width, ROOM.ridge]} />
        <meshStandardMaterial map={endTex} color="#eef2f6" roughness={0.65} metalness={0.3} />
      </mesh>
      <mesh name="왼쪽 벽" position={[-HALF_W, ROOM.eave / 2, MID_Z]} rotation-y={Math.PI / 2} receiveShadow>
        <planeGeometry args={[DEPTH, ROOM.eave]} />
        <meshStandardMaterial map={sideTex} color="#a9b4c2" roughness={0.65} metalness={0.25} />
      </mesh>
      <mesh name="오른쪽 벽" position={[HALF_W, ROOM.eave / 2, MID_Z]} rotation-y={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[DEPTH, ROOM.eave]} />
        <meshStandardMaterial map={sideTex} color="#a9b4c2" roughness={0.65} metalness={0.25} />
      </mesh>
      <Instanced name="벽 LED 띠" items={WALL_STRIPS} material={STRIP_MAT} receiveShadow={false} />

      <Roof map={roofTex} />
      <Parts id="roof_truss" fit={TRUSS_FIT} items={TRUSSES} tint={DARK_STEEL_TINT} />
      <Instanced name="중도리·빔" items={PURLINS} material={STEEL_MAT} />
      <Parts id="steel_column" fit={COLUMN_FIT} items={COLUMN_ITEMS} tint={DARK_STEEL_TINT} castShadow={shadows} />
      <Instanced name="강판 문" items={DOOR_PLATES} material={DOOR_MAT} />
      <Parts id="x_brace" fit={BRACE_FIT} items={BRACE_ITEMS} tint={BRACE_TINT} />

      {/* 세로 LED 바 패널 */}
      <Instanced name="LED 바 패널" items={LIGHT_COLUMN_PANELS} material={STEEL_MAT} />
      <Instanced name="세로 LED 바" items={LIGHT_COLUMN_BARS} material={STRIP_MAT} receiveShadow={false} />
      <Instanced name="패널 표시등" items={PANEL_DOTS} material={WARM_MAT} receiveShadow={false} />

      {/* 무대 · 링 조명 */}
      <mesh name="무대턱" position={[0, STAGE.h / 2, STAGE_Z]} material={STAGE_MAT} castShadow={shadows} receiveShadow>
        <boxGeometry args={[STAGE.w, STAGE.h, STAGE.d]} />
      </mesh>
      <Instanced name="무대 발광 띠" items={STAGE_STRIPS} material={STRIP_MAT} receiveShadow={false} />
      <mesh name="무대 표식" position={[SPOT.x, STAGE.h + 0.012, SPOT.z]} rotation-x={-Math.PI / 2} material={STRIP_MAT}>
        <torusGeometry args={[STAGE_MARK.r, STAGE_MARK.ring / 2, 8, 64]} />
      </mesh>
      <Parts id="ring_lamp" fit={RING_FIT} items={RING_ITEM} receiveShadow={false} />
      <RingLamp />

      {/* 등 뒤 벽 — 격벽 링 + 격납문. 심문소에 문이 하나도 없었다 */}
      <group name="격납문">
        <Parts id="sci_bulkhead" fit={BULKHEAD_FIT} items={BULKHEAD_ITEMS} material={bulkheadMat} castShadow={shadows} />
        <Parts id="sci_blast_door" fit={BLAST_DOOR_FIT} items={BLAST_DOOR_ITEMS} material={blastDoorMat} />
      </group>

      {/* 관찰창 · 모니터 */}
      <ObservationWindow map={mats.windowMap} reflective={quality === 'high'} />
      <Instanced name="모니터 베젤" items={BEZELS} material={STEEL_MAT} />
      {SCREEN_ITEMS.map((it, i) => (
        <mesh key={i} name="모니터" position={[it.x, it.y, SCREEN_Z]} material={mats.screen}>
          <planeGeometry args={[SCREENS.w, SCREENS.h]} />
        </mesh>
      ))}

      {/* 랙 · 케이스 */}
      <Parts id="sci_rack" fit={RACK_FIT} items={RACK_ITEMS} castShadow={shadows} />
      <Instanced name="선반 LED 띠" items={RACK_STRIPS} material={STRIP_MAT} receiveShadow={false} />
      <Parts id="metal_case" fit={CASE_FIT} items={CASE_ITEMS} castShadow={shadows} />
      <Instanced name="랙 표시등" items={RACK_DOTS} material={WARM_MAT} receiveShadow={false} />

      {shadows && <StaticShadows />}
    </group>
  );
}

/**
 * 관찰창 — 참고 렌더의 8각 강철 프레임 + 어두운 반사 유리. high 에서는 MeshReflectorMaterial 이 방(우리)을 비추고,
 * 그 위에 관제실 이미지가 어둡게 겹친다 (씬을 한 번 더 그린다 — 바닥과 합쳐 두 번). 그 아래 화질은 이미지만.
 * 유리는 프레임 안쪽 면(벽에서 depth 의 절반)에, 립은 유리 바로 앞에.
 */
function ObservationWindow({ map, reflective }: { map: THREE.Texture; reflective: boolean }) {
  const z = ROOM.back + 0.02;
  return (
    <group name="관찰창" position={[0, WIN_CY, z]}>
      <mesh geometry={WINDOW_FRAME_GEO} material={FRAME_MAT} castShadow receiveShadow />
      <mesh geometry={WINDOW_LIP_GEO} material={LIP_MAT} position={[0, 0, WINDOW.depth * 0.5]} />
      <mesh name="유리" geometry={WINDOW_GLASS_GEO} position={[0, 0, WINDOW.depth * 0.5 + 0.005]}>
        {reflective ? (
          <MeshReflectorMaterial
            map={map}
            color="#dfe8f4"
            emissiveMap={map}
            emissive="#ffffff"
            emissiveIntensity={0.5}
            mirror={0.3}
            blur={[320, 120]}
            resolution={512}
            mixBlur={1}
            mixStrength={0.7}
            mixContrast={1}
            roughness={0.45}
            metalness={0.08}
            depthScale={0}
          />
        ) : (
          <meshStandardMaterial map={map} color="#dfe8f4" emissiveMap={map} emissive="#ffffff" emissiveIntensity={0.5} roughness={0.45} metalness={0.08} />
        )}
      </mesh>
    </group>
  );
}

/** 무광 검정 타일 바닥. high 에서는 아주 흐린 반사만 — 링 조명·스포트가 밝은 얼룩으로 비치지 않게 mirror 0.18·거칠기 0.6 (사용자 요청) */
function Floor({ map, reflective }: { map: THREE.Texture; reflective: boolean }) {
  return (
    <mesh name="바닥" rotation-x={-Math.PI / 2} position={[0, 0, MID_Z]} receiveShadow>
      <planeGeometry args={[ROOM.width, DEPTH]} />
      {reflective ? (
        <MeshReflectorMaterial
          map={map}
          color="#ffffff"
          blur={[600, 200]}
          resolution={512}
          mixBlur={1}
          mixStrength={0.5}
          mixContrast={1}
          roughness={0.6}
          metalness={0.08}
          depthScale={1}
          minDepthThreshold={0.3}
          maxDepthThreshold={1.6}
          mirror={0.18}
        />
      ) : (
        <meshStandardMaterial map={map} color="#ffffff" roughness={0.6} metalness={0.08} />
      )}
    </mesh>
  );
}

/** 박공지붕 — 경사면 두 장. 안쪽에서 올려다보므로 DoubleSide */
function Roof({ map }: { map: THREE.Texture }) {
  const y = (ROOM.eave + ROOM.ridge) / 2;
  return (
    <group name="지붕">
      {[-1, 1].map((s) => (
        <group key={s} position={[(s * HALF_W) / 2, y, MID_Z]} rotation-z={s * -SLOPE_ANGLE}>
          <mesh rotation-x={Math.PI / 2}>
            <planeGeometry args={[SLOPE_LEN, DEPTH]} />
            <meshStandardMaterial map={map} color="#7d8898" roughness={0.8} metalness={0.3} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** 의자 위 링 조명의 빛 — 기구 본체는 GLB(ring_lamp), 여기는 링 밑면의 발광 테 + 아래로 퍼지는 빛기둥. 광원은 Lights */
function RingLamp() {
  const beamH = RING.y - STAGE.h - 0.1;
  return (
    <group name="링 조명" position={[SPOT.x, 0, SPOT.z]}>
      <mesh position={[0, RING.y - 0.11, 0]} rotation-x={Math.PI / 2} material={RING_MAT}>
        <torusGeometry args={[RING.r, RING.tube * 0.5, 8, 48]} />
      </mesh>
      <mesh position={[0, STAGE.h + 0.1 + beamH / 2, 0]} material={BEAM_MAT} renderOrder={10}>
        <cylinderGeometry args={[RING.r * 0.7, 2.2, beamH, 32, 1, true]} />
      </mesh>
    </group>
  );
}

/**
 * 그림자맵을 한 번만 굽는다 — 그림자를 드리우는 것(기둥·선반·케이스·무대)이 전부 정적이고 아바타는 castShadow 가 없다.
 */
function StaticShadows() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  return null;
}

/* ─────────────────────────────── 조명 ─────────────────────────────── */

/**
 * 위에서 내려오는 차가운 디렉셔널 1(그림자) · 천장 워시 3 · 무대 링 스포트 1 · 모니터 클러스터 2 · 관찰창 1 · 앞쪽 선반 4 · 격납문 1.
 * 격자선·LED 띠·세로 바는 발광 재질만이다 — flicker 는 이 맵에선 쓰지 않는다 (LED 는 흔들리지 않는다).
 */
export function InterrogationLights(_props: { flicker: boolean }) {
  const spot = useRef<THREE.SpotLight>(null);
  const target = useRef<THREE.Object3D>(null);
  useLayoutEffect(() => {
    if (spot.current && target.current) spot.current.target = target.current;
  }, []);

  return (
    <>
      {/* 하늘빛은 거의 없고 땅빛이 청색 — 바닥 격자선이 천장 철골을 아래서 비추는 느낌 */}
      <hemisphereLight args={['#4a6390', '#5273a6', 7.0]} />

      <directionalLight
        position={[4, 22, -2]}
        intensity={1.4}
        color="#9fb6d6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-19}
        shadow-camera-right={19}
        shadow-camera-top={21}
        shadow-camera-bottom={-21}
        shadow-camera-near={1}
        shadow-camera-far={45}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />

      {/* 천장 아래 청회색 워시 3개 — 트러스·옆벽·선반이 참고 이미지처럼 읽히게. 그림자 없음 */}
      {[-13, -2, 8].map((z) => (
        <pointLight key={z} position={[0, ROOM.eave - 0.6, z]} intensity={60} distance={34} decay={1.5} color="#7f9fcc" />
      ))}

      {/* 링 조명 → 무대 가운데 */}
      <object3D ref={target} position={[SPOT.x, STAGE.h, SPOT.z]} />
      <spotLight ref={spot} position={[SPOT.x, RING.y - 0.1, SPOT.z]} angle={0.34} penumbra={0.6} intensity={260} distance={16} decay={1.6} color={KEY_COLOR} />

      {/* 모니터 클러스터 · 관찰창의 청색 번짐 */}
      {[-1, 1].map((s) => (
        <pointLight key={s} position={[s * SCREENS.cx, SCREENS.y, ROOM.back + 1.2]} intensity={14} distance={7} decay={1.8} color={BLUE_COLOR} />
      ))}
      <pointLight position={[0, WIN_CY, ROOM.back + 1.5]} intensity={10} distance={9} decay={1.8} color="#7fa6d8" />

      {RACKS.filter((r) => r.lit).map((r) => (
        <pointLight key={`${r.x}${r.z}`} position={[r.x - Math.sign(r.x) * 0.9, 2.6, r.z]} intensity={8} distance={5} decay={1.8} color={BLUE_COLOR} />
      ))}

      {/* 등 뒤 격납문 — 문틀·문짝이 어둠에 묻히지 않게 */}
      <pointLight position={[0, DOOR_LIGHT.y, ROOM.front - 2.4]} intensity={DOOR_LIGHT.intensity} distance={DOOR_LIGHT.distance} decay={1.7} color="#8fb0da" />
    </>
  );
}

/** high 화질 후처리 — 청색 격자·링·모니터가 안개 속에서 번진다 (참고 렌더의 글로우) */
export function InterrogationEffects() {
  return <Bloom strength={0.55} radius={0.65} threshold={0.45} />;
}

/* ─────────────────────────────── 충돌 ─────────────────────────────── */

/** 충돌 데이터는 interrogation/layout.ts 의 COLLIDERS, 판정은 mp/collide.ts. 여기는 THREE.Vector3 를 제자리에서 고쳐 주는 껍데기다 */
export function resolveInterrogationColliders(p: THREE.Vector3, feetY: number) {
  const out = resolveCollisions(p.x, p.z, feetY, undefined, COLLIDERS);
  p.x = out.x;
  p.z = out.z;
}

export function interrogationGroundHeightAt(x: number, z: number, fromY: number): number {
  return groundHeightWith(x, z, fromY, COLLIDERS);
}
