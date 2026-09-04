/**
 * 특수인공지능대응센터 홀 — 검문소(/interrogation)의 배경. 2026-09-04 참고 이미지대로 새로 지었다.
 *
 * 참고 이미지: 콘크리트 대형 홀. 끝벽에 3면 대형 상황판(한반도 지도 · 데이터 · 안면 스캔), 그 위에 정부 상징과
 * 「대한민국 정부 특수인공지능대응센터」 간판. 양 옆벽엔 2층 메자닌 유리 관제실(중앙 통제실 · 연구구역)과
 * 1층 유리실(서버실 · AI 분석실), 형광등 천장, 광택 콘크리트 바닥에 노란 차선, 철문과 호박색 벽등.
 *
 * ★ **판은 격납고 홀 그대로다.** 발자국(x ±12 · z −20~12) · 무대 · 계단 · 옆벽 콘솔 16 · 컨테이너 6 · 등 뒤 도크 4 의 충돌 상자를
 *   warehouse/layout.ts 에서 그대로 가져온다 — 게임(features/arena)의 ARENA · lab/objects.ts 카탈로그 · 시행 판정이 전부 그
 *   목록을 순서대로 읽기 때문이다. 여기서 바뀌는 것은 **보이는 것**뿐이다 (govcenter/layout.ts). 방(알코브)은 벽 바깥에 파고
 *   메자닌·난간은 머리 위라 새 충돌 상자가 없다. 배회 마당(x ±7 · z −12~0.5)에는 아무것도 안 놓는다.
 *
 * 텍스처(힉스필드 2026-09-04, public/textures/govcenter/): 콘크리트 바닥·벽 2장(z_image), 상황판 3장 · 벽걸이 모니터 1장(nano_banana_pro),
 * 유리 너머 인테리어 4장(soul_location). 간판·정부 상징은 캔버스 텍스처(한글은 이미지 모델이 못 쓴다).
 * GLB(Tripo Studio, tools/govcenter-parts.json → tripo-studio-parts.sh → govcenter-glb.sh): 서버 랙 · 워크스테이션 · 철문 · 벽등.
 * 격납고 홀 부품(콘솔 · 격벽 링 · 격납문 · 컨테이너 · 도크 · 드론)은 그대로 재사용. 알베도는 버리고 노멀맵만 쓴다 (useShapedMaterial).
 *
 * 구조: 배치 배열은 **모듈 수준 상수** — 종류당 드로우콜 하나. 실제 광원은 Lights 가 14개 쥔다. 블룸 없음.
 * 여기에는 **씬만 있다.** 캔버스·카메라·이동·네트워크는 scene/WorldScene.tsx 가 쥔다. 맵 선택은 map/index.ts 의 MAPS.
 */

import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { groundHeightAt as groundHeightWith, resolveCollisions } from '../mp/collide';
import { doors } from '../mp/doors';
import type { QualityTier } from '../perf/quality';
import { GlbPart, type Fit, type InstanceItem } from './corridor/part';
import { Instanced, Parts, useTiled, type Item } from './parts';
import { CONSOLE_FIT, WARM_MAT, hdr, useShapedMaterial } from './scifi';
import {
  BAY_CENTERS,
  BAY_LIGHT,
  BOARD,
  BOARD_CENTER_W,
  BOARD_LIGHT,
  BOARD_SIDE_W,
  CARGO,
  CARGOS,
  CEIL_BEAM,
  CEILING_Y,
  COLLIDERS,
  CONSOLE_BAYS,
  CORNER_PILASTER_X,
  DESK,
  DOCK,
  DOCK_XS,
  DOOR,
  DOOR_LIGHT,
  DRONE,
  EMBLEM,
  END_DOOR_XS,
  FAR_Z,
  FLOOR_TILE,
  FLUOR,
  FOCUS,
  HALL_LEN,
  LANE,
  MEZZ,
  MID_Z,
  NEAR_Z,
  PILASTER,
  PILASTER_ZS,
  RACK,
  RAIL,
  RING,
  ROOMS,
  SIDE_DOOR_Z,
  SIGN,
  STAGE,
  STAGE_CENTER_Z,
  STAGE_FRONT_Z,
  STAGE_MARK,
  STAGE_SPOT,
  STAGE_STRIP,
  STEEL_DOOR,
  STEPS,
  TITLE,
  WALL_LAMP,
  WALL_MONITOR,
  WALL_TILE,
  WALL_X,
  cargoFootprint,
  type CargoPlace,
  type RoomSpec,
} from './govcenter/layout';

export { FOCUS as GOVCENTER_FOCUS };

/* ─────────────────────────────── 텍스처 ─────────────────────────────── */

const TEX = {
  floor: '/textures/govcenter/floor.webp',
  wall: '/textures/govcenter/wall.webp',
  boardLeft: '/textures/govcenter/board_left.webp',
  boardCenter: '/textures/govcenter/board_center.webp',
  boardRight: '/textures/govcenter/board_right.webp',
  monitor: '/textures/govcenter/wall_monitor.webp',
  control: '/textures/govcenter/room_control.webp',
  research: '/textures/govcenter/room_research.webp',
  server: '/textures/govcenter/room_server.webp',
  analysis: '/textures/govcenter/room_analysis.webp',
} as const;
const TEX_LIST = Object.values(TEX);
useTexture.preload(TEX_LIST);

/* ─────────────────────────────── 재질 (텍스처 없는 것은 모듈 수준) ─────────────────────────────── */

/** 철골·베젤 — 격납고 홀과 같은 어두운 강철 */
const BEZEL_MAT = new THREE.MeshStandardMaterial({ color: '#0b0d11', roughness: 0.55, metalness: 0.5 });
/** 무대 — 콘크리트보다 조금 어두운 무광 회색 */
const STAGE_MAT = new THREE.MeshStandardMaterial({ color: '#5f656d', roughness: 0.7, metalness: 0.15 });
const STEP_MAT = new THREE.MeshStandardMaterial({ color: '#555b63', roughness: 0.7, metalness: 0.15 });
const MARK_MAT = new THREE.MeshStandardMaterial({ color: '#3a4049', roughness: 0.75, metalness: 0.1 });
/** 무대턱·계단·컨테이너 밑단의 안내 띠 — 무광 바닥에서 턱이 안 읽히면 헛디딘다 (격납고 홀과 같은 생각). 따뜻한 흰색 */
const GUIDE_MAT = new THREE.MeshBasicMaterial({ color: hdr('#e8e2cf', 0.75), toneMapped: false });
/** 형광등 — 차가운 흰색 발광 */
const FLUOR_MAT = new THREE.MeshBasicMaterial({ color: hdr('#e9f1ff', 1.45), toneMapped: false });
/** 형광등 갓 */
const FLUOR_HOUSING_MAT = new THREE.MeshStandardMaterial({ color: '#d7dbe0', roughness: 0.6, metalness: 0.3 });
/** 바닥 노란 차선 — 닳은 도료 */
const LANE_MAT = new THREE.MeshStandardMaterial({ color: LANE.color, roughness: 0.55, metalness: 0.05 });
/** 유리 — 살짝 푸른 반투명. 안쪽 인테리어가 비쳐 보인다 */
const GLASS_MAT = new THREE.MeshStandardMaterial({ color: '#9fc0e0', roughness: 0.12, metalness: 0.55, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
/** 유리 멀리언·난간 — 어두운 강철 */
const MULLION_MAT = new THREE.MeshStandardMaterial({ color: '#23272d', roughness: 0.5, metalness: 0.6 });
/** 벽등의 호박색 렌즈 */
const LAMP_LENS_MAT = new THREE.MeshBasicMaterial({ color: hdr('#ffb35a', 1.4), toneMapped: false });
/** 드론 렌즈 (격납고 홀과 같은 손) */
const LENS_MAT = new THREE.MeshBasicMaterial({ color: hdr('#ff8a4a', 1.3), toneMapped: false });
/** 간판 띠 바탕 */
const SIGN_BG_MAT = new THREE.MeshStandardMaterial({ color: '#0a0c10', roughness: 0.6, metalness: 0.3 });

/* ─────────────────────────────── 판(plane) 헬퍼 ─────────────────────────────── */

interface Panel {
  position: [number, number, number];
  rotation: [number, number, number];
  w: number;
  h: number;
}

/** 크기별 PlaneGeometry 캐시 — UV 를 월드 m / tile 로 펴서 어느 판이든 같은 재질(repeat 1)로 결이 이어진다 */
const planeCache = new Map<string, THREE.PlaneGeometry>();
function tiledPlane(w: number, h: number, tile: number): THREE.PlaneGeometry {
  const key = `${w.toFixed(3)}x${h.toFixed(3)}/${tile}`;
  let g = planeCache.get(key);
  if (!g) {
    g = new THREE.PlaneGeometry(w, h);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (h / tile));
    uv.needsUpdate = true;
    planeCache.set(key, g);
  }
  return g;
}

/** 그림용 판 — UV 0~1 그대로 (상황판·인테리어·간판) */
const pictureCache = new Map<string, THREE.PlaneGeometry>();
function picturePlane(w: number, h: number): THREE.PlaneGeometry {
  const key = `${w.toFixed(3)}x${h.toFixed(3)}`;
  let g = pictureCache.get(key);
  if (!g) {
    g = new THREE.PlaneGeometry(w, h);
    pictureCache.set(key, g);
  }
  return g;
}

/** 옆벽 판 — 벽면 x = s·WALL_X 에서 홀 안을 본다. 왼벽(s −1)은 +x, 오른벽은 −x */
const sideRot = (s: -1 | 1): [number, number, number] => [0, s < 0 ? Math.PI / 2 : -Math.PI / 2, 0];
function sidePanel(s: -1 | 1, x: number, z0: number, z1: number, y0: number, y1: number): Panel {
  return { position: [x, (y0 + y1) / 2, (z0 + z1) / 2], rotation: sideRot(s), w: z1 - z0, h: y1 - y0 };
}

/**
 * 옆벽 — 방(유리) 자리를 뺀 나머지를 판으로 채운다. z·y 경계선으로 격자를 만들고 방 안이 아닌 칸을 세로로 합친다.
 * 유리는 벽면에 앉으므로 벽은 그 자리를 비워야 안쪽이 보인다.
 */
function sideWallPanels(s: -1 | 1): Panel[] {
  const rooms = ROOMS.filter((r) => r.side === s);
  const zs = [...new Set([FAR_Z, NEAR_Z, ...rooms.flatMap((r) => [r.z0, r.z1])])].sort((a, b) => a - b);
  const ys = [...new Set([0, CEILING_Y, ...rooms.flatMap((r) => [r.y0, r.y1])])].sort((a, b) => a - b);
  const inRoom = (z: number, y: number) => rooms.some((r) => z > r.z0 && z < r.z1 && y > r.y0 && y < r.y1);
  const out: Panel[] = [];
  for (let i = 0; i < zs.length - 1; i++) {
    const zm = (zs[i] + zs[i + 1]) / 2;
    let runStart: number | null = null;
    for (let j = 0; j < ys.length; j++) {
      const ym = j < ys.length - 1 ? (ys[j] + ys[j + 1]) / 2 : NaN;
      const solid = j < ys.length - 1 && !inRoom(zm, ym);
      if (solid && runStart === null) runStart = ys[j];
      if (!solid && runStart !== null) {
        out.push(sidePanel(s, s * WALL_X, zs[i], zs[i + 1], runStart, ys[j]));
        runStart = null;
      }
    }
  }
  return out;
}

const SIDE_WALLS: Panel[] = [...sideWallPanels(-1), ...sideWallPanels(1)];

/** 끝벽·등 뒤 벽·천장·바닥 */
const FAR_WALL: Panel = { position: [0, CEILING_Y / 2, FAR_Z], rotation: [0, 0, 0], w: WALL_X * 2, h: CEILING_Y };
const NEAR_WALL: Panel = { position: [0, CEILING_Y / 2, NEAR_Z], rotation: [0, Math.PI, 0], w: WALL_X * 2, h: CEILING_Y };
const CEILING: Panel = { position: [0, CEILING_Y, MID_Z], rotation: [Math.PI / 2, 0, 0], w: WALL_X * 2, h: HALL_LEN };
const FLOOR: Panel = { position: [0, 0, MID_Z], rotation: [-Math.PI / 2, 0, 0], w: WALL_X * 2, h: HALL_LEN };

/* ─────────────────────────────── 방(알코브) ─────────────────────────────── */

interface RoomBuild {
  spec: RoomSpec;
  /** 뒷벽 — 인테리어 텍스처 */
  back: Panel;
  /** 바닥·천장·양옆 — 콘크리트 */
  shell: Panel[];
  glass: Panel;
  /** 간판 띠(검정 바탕) */
  sign: Panel;
  mullions: Item[];
}

function buildRoom(r: RoomSpec): RoomBuild {
  const s = r.side;
  const xIn = s * WALL_X;
  const xBack = s * (WALL_X + r.depth);
  const xMid = s * (WALL_X + r.depth / 2);
  const glassTop = r.y1 - SIGN.h;
  const len = r.z1 - r.z0;
  const zm = (r.z0 + r.z1) / 2;
  const mullions: Item[] = [
    // 위·아래 가로 프레임
    { position: [xIn, r.y0 + 0.06, zm], scale: [0.12, 0.12, len] },
    { position: [xIn, glassTop - 0.05, zm], scale: [0.12, 0.1, len] },
  ];
  // 세로 멀리언 — 2.7m 마다
  const n = Math.max(1, Math.round(len / 2.7));
  for (let i = 0; i <= n; i++) {
    const z = r.z0 + (len * i) / n;
    mullions.push({ position: [xIn, (r.y0 + glassTop) / 2, z], scale: [0.14, glassTop - r.y0, 0.1] });
  }
  return {
    spec: r,
    back: sidePanel(s, xBack, r.z0, r.z1, r.y0, r.y1),
    shell: [
      { position: [xMid, r.y0 + 0.005, zm], rotation: [-Math.PI / 2, 0, 0], w: r.depth, h: len },
      { position: [xMid, r.y1 - 0.005, zm], rotation: [Math.PI / 2, 0, 0], w: r.depth, h: len },
      { position: [xMid, (r.y0 + r.y1) / 2, r.z0], rotation: [0, 0, 0], w: r.depth, h: r.y1 - r.y0 },
      { position: [xMid, (r.y0 + r.y1) / 2, r.z1], rotation: [0, Math.PI, 0], w: r.depth, h: r.y1 - r.y0 },
    ],
    glass: sidePanel(s, s * (WALL_X - 0.01), r.z0, r.z1, r.y0, glassTop),
    sign: sidePanel(s, s * (WALL_X - 0.03), r.z0, r.z1, glassTop, r.y1),
    mullions,
  };
}

const ROOM_BUILDS: RoomBuild[] = ROOMS.map(buildRoom);
const ROOM_MULLIONS: Item[] = ROOM_BUILDS.flatMap((b) => b.mullions);

/**
 * 방 안 소품 — 서버 랙은 뒷벽 앞 한 줄, 워크스테이션은 유리 쪽 한 줄. 부품마다 앞면 축이 다르다 (tools/glb-preview 로 재었다):
 * 워크스테이션·격납고 부품은 +z, 서버 랙·철문은 +x. 홀 쪽(왼벽 +x · 오른벽 −x)을 보게 각각 돌린다.
 */
const faceHallFromZ = (s: -1 | 1) => (s < 0 ? Math.PI / 2 : -Math.PI / 2);
const faceHallFromX = (s: -1 | 1) => (s < 0 ? 0 : Math.PI);
function rowAlong(r: RoomSpec, unitW: number, gap: number, x: number, rotationY: number): InstanceItem[] {
  const len = r.z1 - r.z0 - 0.5;
  const n = Math.max(1, Math.floor((len + gap) / (unitW + gap)));
  const span = n * unitW + (n - 1) * gap;
  const z0 = (r.z0 + r.z1) / 2 - span / 2 + unitW / 2;
  return Array.from({ length: n }, (_, i): InstanceItem => ({ position: [x, r.y0, z0 + i * (unitW + gap)], rotationY }));
}
const RACK_FIT: Fit = { y: RACK.h };
const RACK_ITEMS: InstanceItem[] = ROOMS.filter((r) => r.props === 'racks').flatMap((r) => rowAlong(r, RACK.w, RACK.gap, r.side * (WALL_X + r.depth - RACK.d / 2 - 0.2), faceHallFromX(r.side)));
const DESK_FIT: Fit = { y: DESK.h };
const DESK_ITEMS: InstanceItem[] = ROOMS.filter((r) => r.props === 'desks').flatMap((r) => rowAlong(r, DESK.w, DESK.gap, r.side * (WALL_X + r.depth * 0.45), faceHallFromZ(r.side)));

/* ─────────────────────────────── 메자닌 띠 · 난간 · 기둥 · 천장 보 · 형광등 ─────────────────────────────── */

/** 메자닌 바닥판 끝 — 옆벽 전체 길이의 콘크리트 띠. 머리 위라 충돌 없음 */
const MEZZ_EDGE: Item[] = [-1, 1].map((s): Item => ({ position: [s * (WALL_X - 0.12), MEZZ.y + MEZZ.slabH / 2, MID_Z], scale: [0.24, MEZZ.slabH, HALL_LEN] }));
/** 난간 — 2층 방 앞(유리 앞)만. 세로 살 + 가로 봉 둘 */
const RAILINGS: Item[] = ROOMS.filter((r) => r.y0 > 1).flatMap((r): Item[] => {
  const s = r.side;
  const x = s * (WALL_X - 0.3);
  const y0 = MEZZ.y + MEZZ.slabH;
  const len = r.z1 - r.z0;
  const zm = (r.z0 + r.z1) / 2;
  const n = Math.round(len / RAIL.postGap);
  const posts: Item[] = Array.from({ length: n + 1 }, (_, i): Item => ({ position: [x, y0 + RAIL.h / 2, r.z0 + (len * i) / n], scale: [RAIL.bar, RAIL.h, RAIL.bar] }));
  return [
    ...posts,
    { position: [x, y0 + RAIL.h, zm], scale: [RAIL.bar * 1.4, RAIL.bar, len] },
    { position: [x, y0 + RAIL.h * 0.55, zm], scale: [RAIL.bar, RAIL.bar, len] },
  ];
});

/** 옆벽 기둥 — 리브 충돌 상자와 같은 발자국, 바닥에서 천장까지. 모서리 넷은 끝벽·등 뒤 벽에 붙는다 */
const PILASTERS: Item[] = [
  ...PILASTER_ZS.flatMap((z): Item[] => [-1, 1].map((s): Item => ({ position: [s * (WALL_X - PILASTER.d / 2), CEILING_Y / 2, z], scale: [PILASTER.d, CEILING_Y, PILASTER.w] }))),
  ...[-1, 1].flatMap((s): Item[] => [FAR_Z, NEAR_Z].map((z): Item => ({ position: [s * CORNER_PILASTER_X, CEILING_Y / 2, z - Math.sign(z - MID_Z) * PILASTER.w / 2], scale: [PILASTER.d, CEILING_Y, PILASTER.w] }))),
];
/** 천장 보 — 기둥 z 마다 홀을 가로지른다 */
const CEIL_BEAMS: Item[] = PILASTER_ZS.map((z): Item => ({ position: [0, CEILING_Y - CEIL_BEAM.h / 2, z], scale: [WALL_X * 2, CEIL_BEAM.h, CEIL_BEAM.d] }));
/**
 * 형광등 — 4줄, 토막이 이어진다. **보 밑에 매달린다** (FLUOR.y 는 보 밑면보다 아래) — 등 간격(4m)이 보 간격과 같아
 * 처음엔 보와 겹치는 토막을 건너뛰었더니 전부 건너뛰어 천장이 캄캄했다 (2026-09-04 첫 렌더).
 */
const FLUOR_TUBES: Item[] = [];
const FLUOR_HOUSINGS: Item[] = [];
for (const x of FLUOR.xs) {
  for (let z = FAR_Z + 1.2; z + FLUOR.len <= NEAR_Z - 1; z += FLUOR.len + FLUOR.gap) {
    const zc = z + FLUOR.len / 2;
    FLUOR_TUBES.push({ position: [x, FLUOR.y, zc], scale: [FLUOR.w, FLUOR.h, FLUOR.len] });
    FLUOR_HOUSINGS.push({ position: [x, FLUOR.y + FLUOR.h / 2 + 0.02, zc], scale: [FLUOR.w + 0.16, 0.06, FLUOR.len + 0.1] });
  }
}

/* ─────────────────────────────── 바닥 차선 ─────────────────────────────── */

const LANES: Item[] = LANE.xs.map((x): Item => ({ position: [x, 0.004, MID_Z], scale: [LANE.w, 0.006, HALL_LEN - 2] }));

/* ─────────────────────────────── 무대 (격납고 홀과 같은 형상) ─────────────────────────────── */

const STAGE_GEO = (() => {
  const hw = STAGE.w / 2;
  const c = STAGE.chamfer;
  const front = -STAGE_FRONT_Z;
  const back = -FAR_Z;
  const sh = new THREE.Shape();
  sh.moveTo(-hw + c, front);
  sh.lineTo(hw - c, front);
  sh.lineTo(hw, front + c);
  sh.lineTo(hw, back);
  sh.lineTo(-hw, back);
  sh.lineTo(-hw, front + c);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: STAGE.h, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
})();
const STEP_ITEMS: Item[] = Array.from({ length: STEPS.n }, (_, i): Item => {
  const top = STEPS.rise * (STEPS.n - i);
  return { position: [0, top / 2, STAGE_FRONT_Z + STEPS.run * (i + 0.5)], scale: [STEPS.w, top, STEPS.run] };
});
const STAGE_STRIPS: Item[] = (() => {
  const items: Item[] = [];
  const hw = STAGE.w / 2;
  const c = STAGE.chamfer;
  const z = STAGE_FRONT_Z + STAGE_STRIP.d / 2 + 0.01;
  const inner = STEPS.w / 2 + 0.25;
  const outer = hw - c - 0.15;
  for (const s of [-1, 1]) {
    items.push({ position: [s * ((inner + outer) / 2), STAGE_STRIP.y, z], scale: [outer - inner, STAGE_STRIP.h, STAGE_STRIP.d] });
    const len = c * Math.SQRT2 - 0.3;
    items.push({ position: [s * (hw - c / 2 + 0.02), STAGE_STRIP.y, STAGE_FRONT_Z + c / 2 + 0.02], scale: [len, STAGE_STRIP.h, STAGE_STRIP.d], rotation: [0, (s * Math.PI) / 4, 0] });
  }
  for (let i = 0; i < STEPS.n; i++) {
    const top = STEPS.rise * (STEPS.n - i);
    items.push({ position: [0, top - 0.09, STAGE_FRONT_Z + STEPS.run * (i + 1) + 0.02], scale: [STEPS.w - 0.6, 0.04, 0.03] });
  }
  return items;
})();
/** 무대 위 스포트 기구 — 천장의 검정 상자 */
const STAGE_FIXTURE: Item[] = [{ position: [0, CEILING_Y - 0.25, STAGE_CENTER_Z], scale: [0.5, 0.5, 0.5] }];

/* ─────────────────────────────── 끝벽 — 상황판 · 간판 · 철문 · 벽등 ─────────────────────────────── */

const BOARD_Y = BOARD.y + BOARD.h / 2;
const BOARD_XS = {
  left: -(BOARD_CENTER_W / 2 + BOARD.gap + BOARD_SIDE_W / 2),
  center: 0,
  right: BOARD_CENTER_W / 2 + BOARD.gap + BOARD_SIDE_W / 2,
} as const;
const BOARD_BEZELS: Item[] = [
  { position: [BOARD_XS.left, BOARD_Y, FAR_Z + BOARD.depth / 2], scale: [BOARD_SIDE_W + BOARD.bezel * 2, BOARD.h + BOARD.bezel * 2, BOARD.depth] },
  { position: [BOARD_XS.center, BOARD_Y, FAR_Z + BOARD.depth / 2], scale: [BOARD_CENTER_W + BOARD.bezel * 2, BOARD.h + BOARD.bezel * 2, BOARD.depth] },
  { position: [BOARD_XS.right, BOARD_Y, FAR_Z + BOARD.depth / 2], scale: [BOARD_SIDE_W + BOARD.bezel * 2, BOARD.h + BOARD.bezel * 2, BOARD.depth] },
];
const BOARD_SCREEN_Z = FAR_Z + BOARD.depth + 0.01;

/** 벽걸이 모니터 — 방이 없는 가운데 bay 의 옆벽 */
const WALL_MONITOR_BEZELS: Item[] = WALL_MONITOR.zs.flatMap((z): Item[] => [-1, 1].map((s): Item => ({ position: [s * (WALL_X - WALL_MONITOR.depth / 2), WALL_MONITOR.y, z], scale: [WALL_MONITOR.depth, WALL_MONITOR.h + WALL_MONITOR.bezel * 2, WALL_MONITOR.w + WALL_MONITOR.bezel * 2] })));
const WALL_MONITOR_SCREENS: Panel[] = WALL_MONITOR.zs.flatMap((z): Panel[] => [-1, 1].map((s): Panel => sidePanel(s as -1 | 1, s * (WALL_X - WALL_MONITOR.depth - 0.01), z - WALL_MONITOR.w / 2, z + WALL_MONITOR.w / 2, WALL_MONITOR.y - WALL_MONITOR.h / 2, WALL_MONITOR.y + WALL_MONITOR.h / 2)));

/** 철문 — 끝벽 둘(무대 옆) + 옆벽 둘. 모델은 창·키패드 면이 +x, 폭이 z. 끝벽 문은 +x → +z 로 (−π/2), 절반을 벽에 묻는다 */
const DOOR_FIT: Fit = { x: STEEL_DOOR.depth, y: STEEL_DOOR.h, z: STEEL_DOOR.w };
const STEEL_DOOR_ITEMS: InstanceItem[] = [
  ...END_DOOR_XS.map((x): InstanceItem => ({ position: [x, 0, FAR_Z + STEEL_DOOR.depth / 4], rotationY: -Math.PI / 2 })),
  ...[-1, 1].map((s): InstanceItem => ({ position: [s * (WALL_X - STEEL_DOOR.depth / 4), 0, SIDE_DOOR_Z], rotationY: faceHallFromX(s as -1 | 1) })),
];
/** 문 위 검정 상인방 — 부품이 벽에 반쯤 묻혀도 문틀이 읽힌다 */
const DOOR_LINTELS: Item[] = [
  ...END_DOOR_XS.map((x): Item => ({ position: [x, STEEL_DOOR.h + 0.08, FAR_Z + 0.06], scale: [STEEL_DOOR.w + 0.3, 0.16, 0.12] })),
  ...[-1, 1].map((s): Item => ({ position: [s * (WALL_X - 0.06), STEEL_DOOR.h + 0.08, SIDE_DOOR_Z], scale: [0.12, 0.16, STEEL_DOOR.w + 0.3] })),
];
/**
 * 벽등 — 문 양옆. 끝벽 넷 + 옆벽 넷. 모델은 바닥판 위에 선 채(+y 가 렌즈 쪽)라 **판이 벽을 보게 눕힌다**:
 * 끝벽(벽이 −z)은 x 축 +90°(−y → −z), 왼벽(벽이 −x)은 z 축 −90°, 오른벽은 +90°. 렌즈는 벽에서 size × 0.6 앞
 */
const LAMP_FIT: Fit = { y: WALL_LAMP.size };
interface LampSpot {
  position: [number, number, number];
  rotation: [number, number, number];
  /** 렌즈(발광 구)의 자리 — 기구 앞면 */
  lens: [number, number, number];
}
const LAMPS: LampSpot[] = [
  ...END_DOOR_XS.flatMap((x): LampSpot[] => [-1, 1].map((k): LampSpot => ({ position: [x + k * WALL_LAMP.off, WALL_LAMP.y, FAR_Z + 0.02], rotation: [Math.PI / 2, 0, 0], lens: [x + k * WALL_LAMP.off, WALL_LAMP.y, FAR_Z + WALL_LAMP.size * 0.6] }))),
  ...[-1, 1].flatMap((s): LampSpot[] => [-1, 1].map((k): LampSpot => ({ position: [s * (WALL_X - 0.02), WALL_LAMP.y, SIDE_DOOR_Z + k * WALL_LAMP.off], rotation: [0, 0, (-s * Math.PI) / 2], lens: [s * (WALL_X - WALL_LAMP.size * 0.6), WALL_LAMP.y, SIDE_DOOR_Z + k * WALL_LAMP.off] }))),
];

/* ─────────────────────────────── 옆벽 콘솔 (충돌 상자와 같은 자리) ─────────────────────────────── */

/** 콘솔 모델의 앞면(홈 파인 면)이 +x — 왼벽은 그대로, 오른벽은 π (scifi.sideConsoles 와 같은 규칙) */
const CONSOLE_ITEMS: InstanceItem[] = CONSOLE_BAYS.flatMap((z) => [-1, 1].map((s): InstanceItem => ({ position: [s * (WALL_X - 0.35), 0, z], rotationY: s < 0 ? 0 : Math.PI })));

/* ─────────────────────────────── 등 뒤 벽 — 격벽 링 · 격납문 · 도크 (격납고 홀 그대로) ─────────────────────────────── */

const RING_MODEL = { w: 0.894, h: 1 } as const;
const RING_FIT: Fit = { x: RING.thickness, y: RING_MODEL.h * RING.scale, z: RING_MODEL.w * RING.scale };
const RING_ITEMS: InstanceItem[] = [{ position: [0, -RING.sink, NEAR_Z - RING.thickness / 2], rotationY: Math.PI / 2 }];
const BLAST_FIT: Fit = { x: DOOR.depth, y: DOOR.h, z: DOOR.w };
const BLAST_ITEMS: InstanceItem[] = [{ position: [0, 0, NEAR_Z - DOOR.depth / 2 - 0.02], rotationY: Math.PI / 2 }];
const DOOR_OPEN_SPEED = 1.1;

/** 등 뒤 격납문 — 들어온 문. 열린 채로 시작해 닫힌다 (world/mp/doors 의 hall). 격납고 홀의 HallDoor 와 같다 */
function HallDoor({ material }: { material: THREE.Material }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const targetY = doors.get().hall * (DOOR.h + 0.2);
    if (Math.abs(g.position.y - targetY) < 1e-3) return;
    g.position.y += Math.sign(targetY - g.position.y) * Math.min(Math.abs(targetY - g.position.y), DOOR_OPEN_SPEED * Math.min(delta, 0.1));
  });
  return (
    <group ref={group} position={[0, doors.get().hall * (DOOR.h + 0.2), 0]}>
      <Parts id="sci_blast_door" fit={BLAST_FIT} items={BLAST_ITEMS} material={material} />
    </group>
  );
}

const DOCK_FIT: Fit = { x: DOCK.w, y: DOCK.h, z: DOCK.depth };
const DOCK_ITEMS: InstanceItem[] = DOCK_XS.map((x): InstanceItem => ({ position: [x, 0, NEAR_Z - DOCK.depth], rotationY: Math.PI }));
const DOCK_FRONT_Z = NEAR_Z - DOCK.depth - 0.03;
const DOCK_STRIPS: Item[] = DOCK_XS.flatMap((x): Item[] => [
  ...[-1, 1].map((s): Item => ({ position: [x + s * DOCK.w * 0.3, DOCK.h * 0.56, DOCK_FRONT_Z], scale: [0.05, DOCK.h * 0.66, 0.03] })),
  { position: [x, 0.1, DOCK_FRONT_Z + 0.06], scale: [DOCK.w * 0.8, 0.04, 0.03] },
]);
const DOCK_DOTS: Item[] = DOCK_XS.map((x): Item => ({ position: [x, DOCK.h * 0.94, DOCK_FRONT_Z], scale: [0.12, 0.08, 0.03] }));

/* ─────────────────────────────── 화물 컨테이너 (격납고 홀 그대로 — 카탈로그 물건) ─────────────────────────────── */

const CARGO_FIT: Fit = { x: CARGO.w, y: CARGO.h, z: CARGO.d };
const CARGO_ITEMS: InstanceItem[] = CARGOS.flatMap((c) =>
  Array.from({ length: c.stack }, (_, i): InstanceItem => {
    const shrink = 1 - i * 0.04;
    return { position: [c.x, CARGO.h * i, c.z], rotationY: (c.dir === 'z' ? Math.PI / 2 : 0) + (i % 2 ? Math.PI : 0), scale: [shrink, 1, shrink] };
  }),
);
const CARGO_STRIP = { h: 0.05, d: 0.03, y: 0.44 } as const;
function cargoBand(c: CargoPlace, y: number, inset: number): Item[] {
  const { hw, hd } = cargoFootprint(c);
  return [
    ...[-1, 1].map((s): Item => ({ position: [c.x, y, c.z + s * (hd - inset)], scale: [hw * 2 - inset * 4, CARGO_STRIP.h, CARGO_STRIP.d] })),
    ...[-1, 1].map((s): Item => ({ position: [c.x + s * (hw - inset), y, c.z], scale: [CARGO_STRIP.d, CARGO_STRIP.h, hd * 2 - inset * 4] })),
  ];
}
const CARGO_STRIPS: Item[] = [...CARGOS.flatMap((c) => cargoBand(c, CARGO_STRIP.y, 0.02)), ...CARGOS.filter((c) => c.stack === 1).flatMap((c) => cargoBand(c, CARGO.h + 0.01, 0.06))];

const DRONE_FIT: Fit = { x: DRONE.size };

/* ─────────────────────────────── 캔버스 텍스처 — 간판 · 정부 상징 (한글은 이미지 모델이 못 쓴다) ─────────────────────────────── */

const KO_FONT = '"Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Nanum Gothic", sans-serif';

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** 방 간판 — 검정 띠에 흰 글씨 */
function signTexture(text: string): THREE.CanvasTexture | null {
  return canvasTexture(1024, 128, (ctx) => {
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = '#e9eef6';
    ctx.font = `600 78px ${KO_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 68);
  });
}

/** 끝벽 간판 — 투명 바탕에 남색 글씨 (벽에 붙인 입체 글자처럼) */
function titleTexture(): THREE.CanvasTexture | null {
  return canvasTexture(2048, 160, (ctx) => {
    ctx.clearRect(0, 0, 2048, 160);
    ctx.fillStyle = '#1b2a4d';
    ctx.font = `800 118px ${KO_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(TITLE.text, 1024, 84);
  });
}

/** 정부 상징 — 남색 원 안의 태극 곡선 (간단한 도형) */
function emblemTexture(): THREE.CanvasTexture | null {
  return canvasTexture(256, 256, (ctx) => {
    ctx.clearRect(0, 0, 256, 256);
    const cx = 128;
    const cy = 128;
    ctx.lineWidth = 16;
    ctx.strokeStyle = '#1b2a4d';
    ctx.beginPath();
    ctx.arc(cx, cy, 104, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#1b2a4d';
    ctx.beginPath();
    ctx.arc(cx, cy, 70, -Math.PI / 2, Math.PI / 2);
    ctx.arc(cx, cy + 35, 35, Math.PI / 2, -Math.PI / 2, true);
    ctx.arc(cx, cy - 35, 35, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.fill();
  });
}

/* ─────────────────────────────── 건물 ─────────────────────────────── */

export interface GovcenterProps {
  /** 품질 단계 — 반사·블룸이 없는 맵이라 쓰지 않는다 (MapDef.Scene 의 시그니처) */
  quality?: QualityTier;
}

/** 콘크리트 셸 · 방 · 상황판 · 무대 · 문 · 격납고 홀에서 온 부품들 */
export function Govcenter(_props: GovcenterProps) {
  const [floorTex, wallTex, boardLeft, boardCenter, boardRight, monitorTex, controlTex, researchTex, serverTex, analysisTex] = useTexture(TEX_LIST);
  const floorMap = useTiled(floorTex, 1, 1);
  const wallMap = useTiled(wallTex, 1, 1);
  const consoleMat = useShapedMaterial('sci_console');
  const ringMat = useShapedMaterial('sci_bulkhead');
  const blastMat = useShapedMaterial('sci_blast_door');
  const cargoMat = useShapedMaterial('cargo_container');
  const dockMat = useShapedMaterial('charge_dock');
  const droneMat = useShapedMaterial('watch_drone');
  const rackMat = useShapedMaterial('gov_server_rack');
  const deskMat = useShapedMaterial('gov_workstation');
  const doorMat = useShapedMaterial('gov_steel_door');
  const lampMat = useShapedMaterial('gov_wall_lamp');

  const mats = useMemo(() => {
    const screen = (t: THREE.Texture, k: number) => {
      const c = t.clone();
      c.colorSpace = THREE.SRGBColorSpace;
      c.anisotropy = 8;
      c.needsUpdate = true;
      return new THREE.MeshBasicMaterial({ map: c, color: hdr('#d6e4f6', k), toneMapped: false });
    };
    const signs = new Map<string, THREE.MeshBasicMaterial>();
    for (const r of ROOMS) {
      const t = signTexture(r.label);
      signs.set(r.label, t ? new THREE.MeshBasicMaterial({ map: t, color: hdr('#ffffff', 0.9), toneMapped: false }) : new THREE.MeshBasicMaterial({ color: '#0a0c10' }));
    }
    const title = titleTexture();
    const emblem = emblemTexture();
    return {
      /** 광택 콘크리트 — 거칠기를 낮춰 형광등·상황판이 바닥에 비친다 (참고 이미지의 젖은 듯한 바닥) */
      floor: new THREE.MeshStandardMaterial({ map: floorMap, color: '#61666d', roughness: 0.3, metalness: 0.12 }),
      wall: new THREE.MeshStandardMaterial({ map: wallMap, color: '#787e86', roughness: 0.92, metalness: 0.02 }),
      ceiling: new THREE.MeshStandardMaterial({ map: wallMap, color: '#4b5057', roughness: 0.95, metalness: 0.02 }),
      pilaster: new THREE.MeshStandardMaterial({ map: wallMap, color: '#6a7078', roughness: 0.92, metalness: 0.02 }),
      /** 방 안 콘크리트 — 홀보다 어둡다 (안이 어두워야 유리가 유리로 읽힌다) */
      roomShell: new THREE.MeshStandardMaterial({ map: wallMap, color: '#3a3f46', roughness: 0.95, metalness: 0.02 }),
      boardLeft: screen(boardLeft, 0.9),
      boardCenter: screen(boardCenter, 0.95),
      boardRight: screen(boardRight, 0.9),
      monitor: screen(monitorTex, 0.8),
      interior: {
        control: screen(controlTex, 0.72),
        research: screen(researchTex, 0.72),
        server: screen(serverTex, 0.72),
        analysis: screen(analysisTex, 0.72),
      } as Record<RoomSpec['interior'], THREE.MeshBasicMaterial>,
      signs,
      title: title ? new THREE.MeshBasicMaterial({ map: title, transparent: true, toneMapped: false }) : null,
      emblem: emblem ? new THREE.MeshBasicMaterial({ map: emblem, transparent: true, toneMapped: false }) : null,
    };
  }, [floorMap, wallMap, boardLeft, boardCenter, boardRight, monitorTex, controlTex, researchTex, serverTex, analysisTex]);
  useEffect(
    () => () => {
      for (const m of [mats.floor, mats.wall, mats.ceiling, mats.pilaster, mats.roomShell, mats.boardLeft, mats.boardCenter, mats.boardRight, mats.monitor, mats.title, mats.emblem, ...Object.values(mats.interior), ...mats.signs.values()]) m?.dispose();
    },
    [mats],
  );

  const panel = (p: Panel, material: THREE.Material, tile: number, key: string) => <mesh key={key} geometry={tiledPlane(p.w, p.h, tile)} position={p.position} rotation={p.rotation} material={material} receiveShadow />;
  /** 텍스처 한 장을 판 전체에 — UV 0~1 (tiledPlane 은 UV 를 m/tile 로 펴므로 여기 쓰면 한 텍셀만 찍힌다) */
  const picture = (p: Panel, material: THREE.Material, key: string) => <mesh key={key} geometry={picturePlane(p.w, p.h)} position={p.position} rotation={p.rotation} material={material} />;

  return (
    <group name="특수인공지능대응센터 홀">
      {/* 콘크리트 셸 */}
      {panel(FLOOR, mats.floor, FLOOR_TILE, 'floor')}
      {panel(CEILING, mats.ceiling, WALL_TILE, 'ceiling')}
      {panel(FAR_WALL, mats.wall, WALL_TILE, 'far')}
      {panel(NEAR_WALL, mats.wall, WALL_TILE, 'near')}
      {SIDE_WALLS.map((p, i) => panel(p, mats.wall, WALL_TILE, `side${i}`))}
      <Instanced name="기둥" items={PILASTERS} material={mats.pilaster} />
      <Instanced name="천장 보" items={CEIL_BEAMS} material={mats.ceiling} />
      <Instanced name="형광등 갓" items={FLUOR_HOUSINGS} material={FLUOR_HOUSING_MAT} />
      <Instanced name="형광등" items={FLUOR_TUBES} material={FLUOR_MAT} receiveShadow={false} />
      <Instanced name="차선" items={LANES} material={LANE_MAT} />
      <Instanced name="메자닌 턱" items={MEZZ_EDGE} material={mats.pilaster} />
      <Instanced name="난간" items={RAILINGS} material={MULLION_MAT} />

      {/* 유리 방 넷 — 알코브 셸 · 인테리어 · 유리 · 간판 */}
      {ROOM_BUILDS.map((b) => (
        <group key={b.spec.label} name={b.spec.label}>
          {b.shell.map((p, i) => panel(p, mats.roomShell, WALL_TILE, `${b.spec.label}-shell${i}`))}
          {picture(b.back, mats.interior[b.spec.interior], `${b.spec.label}-back`)}
          {picture(b.glass, GLASS_MAT, `${b.spec.label}-glass`)}
          {picture(b.sign, mats.signs.get(b.spec.label) ?? SIGN_BG_MAT, `${b.spec.label}-sign`)}
        </group>
      ))}
      <Instanced name="유리 프레임" items={ROOM_MULLIONS} material={MULLION_MAT} />
      <Parts id="gov_server_rack" fit={RACK_FIT} items={RACK_ITEMS} material={rackMat} />
      <Parts id="gov_workstation" fit={DESK_FIT} items={DESK_ITEMS} material={deskMat} />

      {/* 끝벽 — 상황판 3면 · 간판 · 정부 상징 */}
      <group name="상황판">
        <Instanced name="상황판 베젤" items={BOARD_BEZELS} material={BEZEL_MAT} />
        <mesh position={[BOARD_XS.left, BOARD_Y, BOARD_SCREEN_Z]} material={mats.boardLeft}>
          <planeGeometry args={[BOARD_SIDE_W, BOARD.h]} />
        </mesh>
        <mesh position={[BOARD_XS.center, BOARD_Y, BOARD_SCREEN_Z]} material={mats.boardCenter}>
          <planeGeometry args={[BOARD_CENTER_W, BOARD.h]} />
        </mesh>
        <mesh position={[BOARD_XS.right, BOARD_Y, BOARD_SCREEN_Z]} material={mats.boardRight}>
          <planeGeometry args={[BOARD_SIDE_W, BOARD.h]} />
        </mesh>
        {mats.title && (
          <mesh name="간판" position={[0, TITLE.y, FAR_Z + 0.03]} material={mats.title}>
            <planeGeometry args={[TITLE.w, TITLE.h]} />
          </mesh>
        )}
        {mats.emblem && (
          <mesh name="정부 상징" position={[0, EMBLEM.y, FAR_Z + 0.03]} material={mats.emblem}>
            <planeGeometry args={[EMBLEM.r * 2, EMBLEM.r * 2]} />
          </mesh>
        )}
      </group>

      {/* 옆벽 벽걸이 모니터 · 콘솔(충돌 상자 자리) */}
      <Instanced name="모니터 베젤" items={WALL_MONITOR_BEZELS} material={BEZEL_MAT} />
      {WALL_MONITOR_SCREENS.map((p, i) => picture(p, mats.monitor, `monitor${i}`))}
      <Parts id="sci_console" fit={CONSOLE_FIT} items={CONSOLE_ITEMS} material={consoleMat} />

      {/* 무대 · 계단 · 안내 띠 · 표식 · 스포트 기구 */}
      <group name="무대">
        <mesh name="무대턱" geometry={STAGE_GEO} material={STAGE_MAT} />
        <Instanced name="계단" items={STEP_ITEMS} material={STEP_MAT} />
        <Instanced name="무대 안내 띠" items={STAGE_STRIPS} material={GUIDE_MAT} receiveShadow={false} />
        <mesh name="무대 표식" rotation-x={-Math.PI / 2} position={[0, STAGE.h + 0.006, STAGE_CENTER_Z]} material={MARK_MAT}>
          <circleGeometry args={[STAGE_MARK.r, 48]} />
        </mesh>
        <mesh name="무대 표식 링" rotation-x={-Math.PI / 2} position={[0, STAGE.h + 0.012, STAGE_CENTER_Z]} material={GUIDE_MAT}>
          <ringGeometry args={[STAGE_MARK.r - STAGE_MARK.ring, STAGE_MARK.r, 64]} />
        </mesh>
        <Instanced name="스포트 기구" items={STAGE_FIXTURE} material={BEZEL_MAT} />
      </group>

      {/* 철문 · 벽등 */}
      <Parts id="gov_steel_door" fit={DOOR_FIT} items={STEEL_DOOR_ITEMS} material={doorMat} />
      <Instanced name="문 상인방" items={DOOR_LINTELS} material={BEZEL_MAT} />
      {LAMPS.map((l, i) => (
        <group key={i} name="벽등">
          <GlbPart id="gov_wall_lamp" fit={LAMP_FIT} position={l.position} rotation={l.rotation} material={lampMat} receiveShadow={false} />
          <mesh position={l.lens} material={LAMP_LENS_MAT}>
            <sphereGeometry args={[0.07, 10, 10]} />
          </mesh>
        </group>
      ))}

      {/* 등 뒤 — 격벽 링 + 격납문 + 충전 도크 (격납고 홀 그대로) */}
      <Parts id="sci_bulkhead" fit={RING_FIT} items={RING_ITEMS} material={ringMat} />
      <HallDoor material={blastMat} />
      <Parts id="charge_dock" fit={DOCK_FIT} items={DOCK_ITEMS} material={dockMat} />
      <Instanced name="도크 채널" items={DOCK_STRIPS} material={GUIDE_MAT} receiveShadow={false} />
      <Instanced name="도크 표시등" items={DOCK_DOTS} material={WARM_MAT} receiveShadow={false} />

      {/* 바닥의 화물 컨테이너 — 리더가 가리킬 물건 (lab/objects.ts 카탈로그) */}
      <Parts id="cargo_container" fit={CARGO_FIT} items={CARGO_ITEMS} material={cargoMat} />
      <Instanced name="컨테이너 띠" items={CARGO_STRIPS} material={GUIDE_MAT} receiveShadow={false} />

      <WatchDrone material={droneMat} />
    </group>
  );
}

/** 홀을 도는 감시 드론 — 격납고 홀의 것 그대로. 이 방에서 유일하게 움직이는 배경 */
function WatchDrone({ material }: { material: THREE.Material }) {
  const g = useRef<THREE.Group>(null);
  useFrame((state) => {
    const grp = g.current;
    if (!grp) return;
    const a = (state.clock.elapsedTime / DRONE.period) * Math.PI * 2;
    grp.position.set(Math.cos(a) * DRONE.r, DRONE.y + Math.sin(a * 3) * DRONE.bob, DRONE.cz + Math.sin(a) * DRONE.r);
    grp.rotation.y = -a + Math.PI / 2;
  });
  return (
    <group ref={g} name="감시 드론">
      <GlbPart id="watch_drone" fit={DRONE_FIT} material={material} />
      <mesh position={[0, DRONE.size * 0.2, DRONE.size * 0.5]} material={LENS_MAT}>
        <sphereGeometry args={[0.07, 12, 12]} />
      </mesh>
    </group>
  );
}

/* ─────────────────────────────── 조명 ─────────────────────────────── */

/**
 * 실제 광원 14개 — 형광등 점광원 8(bay) · 상황판 점광원 3 · 무대 스포트 1 · 끝벽 벽등 2. 그림자·깜빡임 없음.
 * 옆벽 벽등 넷은 렌즈 발광만 (예산).
 */
export function GovcenterLights(_props: { flicker: boolean }) {
  const spot = useRef<THREE.SpotLight>(null);
  const target = useRef<THREE.Object3D>(null);
  useLayoutEffect(() => {
    if (spot.current && target.current) spot.current.target = target.current;
  }, []);

  return (
    <>
      <hemisphereLight args={['#c9d3e2', '#2e3238', 0.7]} />
      {BAY_CENTERS.map((z) => (
        <pointLight key={z} position={[0, BAY_LIGHT.y, z]} intensity={BAY_LIGHT.intensity} distance={BAY_LIGHT.distance} decay={1.7} color="#dfe8f7" />
      ))}
      {/* 상황판의 푸른 빛 — 무대와 홀 앞쪽으로 */}
      {[BOARD_XS.left, 0, BOARD_XS.right].map((x) => (
        <pointLight key={x} position={[x, BOARD_LIGHT.y, FAR_Z + BOARD_LIGHT.off]} intensity={BOARD_LIGHT.intensity} distance={BOARD_LIGHT.distance} decay={1.7} color="#86b4ff" />
      ))}
      {/* 스포트 → 무대 가운데 */}
      <object3D ref={target} position={[0, STAGE.h, STAGE_CENTER_Z]} />
      <spotLight ref={spot} position={[0, STAGE_SPOT.y, STAGE_CENTER_Z]} angle={STAGE_SPOT.angle} penumbra={0.6} intensity={STAGE_SPOT.intensity} distance={STAGE_SPOT.distance} decay={1.6} color="#eef3ff" />
      {/* 끝벽 철문의 호박색 벽등 */}
      {END_DOOR_XS.map((x) => (
        <pointLight key={x} position={[x, WALL_LAMP.y, FAR_Z + 0.6]} intensity={DOOR_LIGHT.intensity} distance={DOOR_LIGHT.distance} decay={1.8} color="#ffb060" />
      ))}
    </>
  );
}

/* ─────────────────────────────── 충돌 ─────────────────────────────── */

/** 충돌 데이터는 warehouse/layout.ts 의 COLLIDERS(재수출), 판정은 mp/collide.ts. 여기는 THREE.Vector3 를 제자리에서 고쳐 주는 껍데기다 */
export function resolveGovcenterColliders(p: THREE.Vector3, feetY: number) {
  const out = resolveCollisions(p.x, p.z, feetY, undefined, COLLIDERS);
  p.x = out.x;
  p.z = out.z;
}

export function govcenterGroundHeightAt(x: number, z: number, fromY: number): number {
  return groundHeightWith(x, z, fromY, COLLIDERS);
}
