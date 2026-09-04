/**
 * 기록 복도 — 마지막 방으로 가는 길. **벽화가 다섯 장이 아니라 수백 장인 곳**이다.
 *
 * 본판 복도의 그림 다섯 장은 그것만 있으면 분위기다. 같은 손이 그린 것이 수백 장 쌓인 벽을 한 번 지나가야
 * 그 다섯 장이 뜻을 갖는다 — 여기에는 지난 판들의 그림이 걸린다. 팔고 나간 판, 보내진 판, 대신 죽은 판.
 *
 * 이 방에는 대사가 하나도 없다. 걷는 동안 벽만 흐르고, 속마음 한 줄만 허락한다 (features/world2/scenario2.ts).
 * 그래서 **벽 장식을 통째로 뺐다** — 세로 튜브도, 데이터 화면도, 콘솔도 없다. 벽은 그림 거는 자리다.
 * 그림 자체는 맵이 아니라 features/world2/ArchiveWall.tsx 가 건다 (본판이 복도와 Chapter1Scene 을 나눈 것과 같은 규칙).
 *
 * ★ **4.5 × 60 m 곡선** — 레벨 설계 「누가 듣고 있나」 챕터 6 은 3 × 60 이다. 3 m 에 리브(0.4)가 4 m 마다 튀어나오니
 *   그림 앞을 오가는 A-137 이 벽 쪽에 서면 사람이 지날 폭이 0.38 m 였다 (2026-09-03) — 4.5 로 넓혀 그 자리에서도 1.7 m 가 남는다.
 *   「양쪽 벽이 한 번에 눈에 들어온다」는 4.5 에서도 성립한다(시야 90° 에서 2.25 m 앞부터). 곧으면 들어서는 순간 끝이 보이고,
 *   끝이 보이면 「끝이 없다」가 안 된다 (설계 01). 반지름 ≈ 23 m · 150° 를 돈다: 안쪽 벽이 시야를 가려 어느 자리에서도
 *   앞이 23 m 남짓밖에 안 보인다 — 나가는 문은 걸어가 봐야 있다.
 *   공용 키트(world/map/scifi.tsx)의 껍데기는 z 축 직선 상자라 휘지 못한다. 그래서 이 방만 **8각 단면을 호를 따라 1 m 마다
 *   세우고 그 사이를 꿰맨 지오메트리 하나**로 껍데기를 만든다. 단면 치수·재질·타일은 키트 것을 그대로 쓴다 —
 *   휘었다고 다른 시설처럼 보이면 「같은 구역」이 거짓이 된다.
 *
 * 좌표: 들어온 문이 (0, 6) 이고 처음엔 −z 를 향한다. 호는 오른쪽(+x)으로 돈다 — 오른쪽 벽이 안쪽(짧은) 벽, 왼쪽이 바깥 벽.
 * 방 안의 자리는 전부 **호 길이 s(0 = 들어온 문, 60 = 나가는 문)와 벽 쪽 거리**로 말한다 (ARCHIVE_PATH).
 * 세상 x·z 로 적으면 곡률을 바꿀 때 벽에 걸린 것 수백 장이 전부 틀어진다.
 *
 * 설계서가 정한 값:
 *   02 조명은 벽면만 — 바닥이 어두워야 시선이 계속 옆으로 간다 (ArchiveLights: 벽 등만, 낮게)
 *   03 「금 열여섯」은 정확히 한가운데 s = 30 (archiveAtMid)
 *   04 A-155 의 그림만 낮게 (ArchiveWall 이 ARCHIVE_PATH.sideAnchor 로 건다)
 */

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import type { Fit, InstanceItem } from '@/world/map/corridor/part';
import { Parts, useTiled } from '@/world/map/parts';
import {
  Doorway,
  FLOOR_TILE,
  GRATE,
  RIB_STRIP,
  SHELL_COLORS,
  SIDES,
  STEEL_MAT,
  STRIP_MAT,
  WALL_ROT,
  WALL_TILE,
  makeEndWallGeometry,
  makeRibGeometry,
  metrics,
  openingFor,
  useSciTextures,
  useShapedMaterial,
  type Metrics,
  type Profile,
  type SciTextures,
} from '@/world/map/scifi';
import { groundHeightAt as groundHeightWith, resolveCollisions, type Collider } from '@/world/mp/collide';
import type { QualityTier } from '@/world/perf/quality';

import { exitDoor } from './exitDoor';
import { SlidingLeaf } from './leaf';
import { GAP, RIB, RING_MODEL } from './room';

/* ─────────────────────────────── 길 ─────────────────────────────── */

/** 폭 4.5 m(벽 안쪽 ±2.25) · 수직 벽 2.6 · 천장 3.4 — 좁은 것이 규칙이다: 양쪽 벽이 한 번에 눈에 들어와야 「수백 장」이 수백 장으로 보인다 (머리말) */
const WALL_X = 2.25;
const WALL_TOP_Y = 2.6;
const CEILING_Y = 3.4;

/** 중심선 길이 — 설계의 60 m. 폭과 함께 시험이 쥔다 */
export const ARCHIVE_LENGTH = 60;
/**
 * 도는 각 150°. 반지름은 길이에서 나온다(≈ 22.9 m). 이 각이면 바깥 벽에 붙어 서도 안쪽 벽 너머가 23 m 에서 잘린다 —
 * 60 m 의 끝은 어느 자리에서도 안 보인다 (설계 01). 120° 아래로 내리면 들어서자마자 끝의 문이 보인다
 */
const SWEEP = (5 * Math.PI) / 6;
const RADIUS = ARCHIVE_LENGTH / SWEEP;
/** 들어온 문의 자리. 처음엔 −z 를 향하고, 호의 중심은 그 오른쪽(+x)이다 */
const ENTRANCE = { x: 0, z: 6 } as const;
const CENTER = { x: ENTRANCE.x + RADIUS, z: ENTRANCE.z } as const;

export interface PathPoint {
  x: number;
  z: number;
  /** 이 자리의 진행 방향을 rotation.y 로 — 이만큼 돌린 것의 −z 가 나가는 쪽을 본다 */
  heading: number;
  /** 왼쪽(바깥 벽) 단위 법선 */
  nx: number;
  nz: number;
}

const clampS = (s: number) => Math.max(0, Math.min(ARCHIVE_LENGTH, s));

/** 호 위의 각 — 0 이 들어온 문, SWEEP 이 나가는 문. 방 밖의 점은 어느 끝에 가까운지로 붙인다 */
function angleOf(x: number, z: number): { phi: number; onArc: boolean } {
  const raw = Math.atan2(-(z - CENTER.z), -(x - CENTER.x));
  if (raw >= 0 && raw <= SWEEP) return { phi: raw, onArc: true };
  const toStart = Math.min(Math.abs(raw), Math.abs(raw + Math.PI * 2));
  const toEnd = Math.min(Math.abs(raw - SWEEP), Math.abs(raw + Math.PI * 2 - SWEEP));
  return { phi: toStart <= toEnd ? 0 : SWEEP, onArc: false };
}

/**
 * 중심선 — 벽에 걸리는 것·서는 자리·트리거가 전부 이것으로 자리를 말한다.
 * s 는 호 길이(m), 벽 쪽 거리 lateral 은 **오른쪽(안쪽 벽)이 +** 다 (카메라 로컬 +x 와 같은 규약).
 */
export const ARCHIVE_PATH = {
  length: ARCHIVE_LENGTH,
  radius: RADIUS,
  sweep: SWEEP,
  center: CENTER,

  at(s: number): PathPoint {
    const phi = clampS(s) / RADIUS;
    return { x: CENTER.x - RADIUS * Math.cos(phi), z: CENTER.z - RADIUS * Math.sin(phi), heading: -phi, nx: -Math.cos(phi), nz: -Math.sin(phi) };
  },

  /** 중심선에서 옆으로 lateral 만큼 — 서는 자리·벽 등이 쓴다 */
  point(s: number, lateral = 0): { x: number; z: number } {
    const p = this.at(s);
    return { x: p.x - p.nx * lateral, z: p.z - p.nz * lateral };
  },

  /** 이 점에 가장 가까운 호 길이 — 트리거가 쓴다. 문 밖(호 밖)의 점은 0 또는 60 */
  progress(x: number, z: number): number {
    return angleOf(x, z).phi * RADIUS;
  },

  /** 중심선에서 얼마나 옆인가 — 오른쪽(안쪽 벽)이 + */
  lateral(x: number, z: number): number {
    return RADIUS - Math.hypot(x - CENTER.x, z - CENTER.z);
  },

  /** 벽에 거는 것의 자리 — 벽면에서 lift 만큼 띄운 점과, 그림의 정면이 통로를 보게 하는 rotation.y */
  sideAnchor(s: number, side: -1 | 1, y: number, lift = 0.04): { x: number; y: number; z: number; rotY: number } {
    const p = this.at(s);
    const q = this.point(s, side * (WALL_X - lift));
    return { x: q.x, y, z: q.z, rotY: p.heading - side * (Math.PI / 2) };
  },
} as const;

/** 이 점이 복도 바닥 안인가 — 벽에서 margin 만큼 들어온 자리만 「안」으로 친다 (순찰 자리 시험이 쓴다) */
export function archiveContains(x: number, z: number, margin = 0.4): boolean {
  const { phi, onArc } = angleOf(x, z);
  const s = phi * RADIUS;
  return onArc && s >= margin && s <= ARCHIVE_LENGTH - margin && Math.abs(ARCHIVE_PATH.lateral(x, z)) <= WALL_X - margin;
}

/** 나가는 문 앞 — 문턱이 아니라 **문 앞**이다 (곧은 방들의 farZ + 2.2 와 같은 거리) */
const EXIT_REACH = 2.2;
export function archiveAtExit(x: number, z: number): boolean {
  return ARCHIVE_PATH.progress(x, z) >= ARCHIVE_LENGTH - EXIT_REACH;
}

/** 한가운데 — 「금 열여섯」이 걸린 자리 앞 (설계 03: 걸음이 저절로 멈추는 자리) */
export const ARCHIVE_MID_S = ARCHIVE_LENGTH / 2;
export function archiveAtMid(x: number, z: number): boolean {
  return Math.abs(ARCHIVE_PATH.progress(x, z) - ARCHIVE_MID_S) < 2;
}

/* ─────────────────────────────── 단면 ─────────────────────────────── */

/**
 * 8각 단면 — 키트의 Profile 을 그대로 쓰되 **z 는 펴 놓은 좌표**다: nearZ 0 = 들어온 문(s 0), farZ −60 = 나가는 문(s 60).
 * 세상 z 가 아니다. 리브·끝벽 지오메트리(makeRibGeometry·makeEndWallGeometry)가 이 단면 수치만 읽으므로 그대로 맞는다.
 * 천장 반폭은 makeRoom 과 같은 규칙(45° 챔퍼)이다.
 */
const PROFILE: Profile = { wallX: WALL_X, wallTopY: WALL_TOP_Y, ceilingY: CEILING_Y, ceilHalf: WALL_X - (CEILING_Y - WALL_TOP_Y), farZ: -ARCHIVE_LENGTH, nearZ: 0 };
const M: Metrics = metrics(PROFILE);

/** 리브 4 m 마다 — 그 사이가 bay. 그림은 리브 사이에 걸린다 */
const BAY = 4;
const RIB_SS: number[] = [];
const BAY_SS: number[] = [];
for (let s = BAY; s < ARCHIVE_LENGTH; s += BAY) RIB_SS.push(s);
for (let s = BAY / 2; s < ARCHIVE_LENGTH; s += BAY) BAY_SS.push(s);

/* ─────────────────────────────── 껍데기 ─────────────────────────────── */

/** 1 m 마다 단면을 세운다 — 반지름 23 m 에서 1 m 현의 처짐이 5 mm 라 벽이 매끈하게 읽힌다 */
const STATION = 1;
const STATIONS: number[] = [];
for (let s = 0; s <= ARCHIVE_LENGTH + 1e-9; s += STATION) STATIONS.push(Math.min(s, ARCHIVE_LENGTH));

/** 껍데기 재질 순서 — 지오메트리 그룹 번호가 곧 이 순서다 */
const SURF = { floor: 0, grate: 1, wall: 2, chamfer: 3, ceiling: 4 } as const;

interface Strip {
  /** 단면 위의 두 점 (x 옆, y 높이) — a 에서 b 로 */
  a: [number, number];
  b: [number, number];
  mat: number;
  /** 호 길이 방향 타일 한 장의 길이(m) — 키트의 Shell 과 같은 반복 */
  tile: number;
  /** a→b 방향으로 타일 몇 장 */
  across: number;
}

const GRATE_X = WALL_X - GRATE.inset - GRATE.w / 2;
const STRIPS: readonly Strip[] = [
  { a: [-WALL_X, 0], b: [WALL_X, 0], mat: SURF.floor, tile: FLOOR_TILE, across: M.width / FLOOR_TILE },
  ...SIDES.map((s): Strip => ({ a: [s * (GRATE_X - GRATE.w / 2), GRATE.lift], b: [s * (GRATE_X + GRATE.w / 2), GRATE.lift], mat: SURF.grate, tile: GRATE.w, across: 1 })),
  ...SIDES.map((s): Strip => ({ a: [s * WALL_X, 0], b: [s * WALL_X, WALL_TOP_Y], mat: SURF.wall, tile: WALL_TILE, across: 1 })),
  ...SIDES.map((s): Strip => ({ a: [s * WALL_X, WALL_TOP_Y], b: [s * M.ceilHalf, CEILING_Y], mat: SURF.chamfer, tile: WALL_TILE, across: M.len / WALL_TILE })),
  { a: [-M.ceilHalf, CEILING_Y], b: [M.ceilHalf, CEILING_Y], mat: SURF.ceiling, tile: 4.8, across: (M.ceilHalf * 2) / 2.4 },
];

/**
 * 호를 따라 꿰맨 껍데기 — 단면의 띠(바닥·격자·벽·경사면·천장)마다 정거장 두 점씩 놓고 사각형으로 잇는다.
 * 한 지오메트리에 재질 그룹 다섯. UV 의 u 는 호 길이 / 타일이라 곧은 방과 같은 결 크기로 반복된다.
 * 띠는 정점을 안 나눠 쓴다 — 나눠 쓰면 바닥과 벽의 법선이 섞여 모서리가 둥글게 빛난다.
 */
function makeArcShell(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const g = new THREE.BufferGeometry();
  const inwardOf = (st: Strip) => ({ x: -(st.a[0] + st.b[0]) / 2, y: M.ceilingY / 2 - (st.a[1] + st.b[1]) / 2 });

  for (const st of STRIPS) {
    const base = pos.length / 3;
    const start = idx.length;
    for (const s of STATIONS) {
      const p = ARCHIVE_PATH.at(s);
      for (const [k, q] of [st.a, st.b].entries()) {
        pos.push(p.x - p.nx * q[0], q[1], p.z - p.nz * q[0]);
        uv.push(s / st.tile, k * st.across);
      }
    }
    // 앞면이 실내를 보게 — 첫 사각형의 법선을 단면 가운데 쪽과 견줘 감는 방향을 정한다
    const p0 = ARCHIVE_PATH.at(0);
    const p1 = ARCHIVE_PATH.at(STATIONS[1]);
    const along = new THREE.Vector3(p1.x - p0.x, 0, p1.z - p0.z);
    const acrossV = new THREE.Vector3(-p0.nx * (st.b[0] - st.a[0]), st.b[1] - st.a[1], -p0.nz * (st.b[0] - st.a[0]));
    const inward = inwardOf(st);
    const inward3 = new THREE.Vector3(-p0.nx * inward.x, inward.y, -p0.nz * inward.x);
    const flip = along.clone().cross(acrossV).dot(inward3) < 0;
    for (let i = 0; i < STATIONS.length - 1; i += 1) {
      const a = base + i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      if (flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
    g.addGroup(start, idx.length - start, st.mat);
  }

  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
const SHELL_GEO = makeArcShell();

/** 정거장 프레임의 변환 — at(s) 의 자리와 heading */
const frameAt = (s: number, out: THREE.Matrix4): THREE.Matrix4 => {
  const p = ARCHIVE_PATH.at(s);
  return out.makeRotationY(p.heading).setPosition(p.x, 0, p.z);
};

/* ─────────────────────────────── 문 ─────────────────────────────── */

/**
 * 폭이 3 m 뿐이라 **문도 링도 이 방 것을 따로 쓴다** — 공용 격납문(3.6 m)은 복도보다 넓어서 벽을 통째로 먹는다.
 * 좁은 문은 이 방의 뜻이기도 하다: 여기는 통과하는 길이지 검문하는 자리가 아니다.
 */
const ARCHIVE_DOOR = { w: 2.2, h: 3.0, depth: 0.3 } as const;
const ARCHIVE_RING = { scale: 4, sink: 0.12 * 4, thickness: 0.7 } as const;
const OPENING = openingFor(ARCHIVE_DOOR);
const END_WALL_GEO = makeEndWallGeometry(M, undefined, OPENING);
const RIB_GEO = makeRibGeometry(M, RIB);

const RING_FIT: Fit = { x: ARCHIVE_RING.thickness, y: RING_MODEL.h * ARCHIVE_RING.scale, z: RING_MODEL.w * ARCHIVE_RING.scale };
/** 끝의 프레임 안 자리 — 방 안쪽이 들어온 문에서는 −z, 나가는 문에서는 +z 다 */
const NEAR_RING_ITEMS: InstanceItem[] = [{ position: [0, -ARCHIVE_RING.sink, -ARCHIVE_RING.thickness / 2], rotationY: Math.PI / 2 }];
const FAR_RING_ITEMS: InstanceItem[] = [{ position: [0, -ARCHIVE_RING.sink, ARCHIVE_RING.thickness / 2], rotationY: Math.PI / 2 }];
const DOOR_FIT: Fit = { x: ARCHIVE_DOOR.depth, y: ARCHIVE_DOOR.h, z: ARCHIVE_DOOR.w };
/** 들어온 문은 닫힌 채다 — 이 길은 한 방향이다 */
const NEAR_DOOR_ITEMS: InstanceItem[] = [{ position: [0, 0, -ARCHIVE_DOOR.depth / 2 - GAP], rotationY: Math.PI / 2 }];
/** 나가는 문 — 잠기지는 않지만 다가서야 열린다 (scenario2 → exitDoor). 60 m 끝에 닫힌 문이 서 있어야 「끝이 있다」가 보인다 */
const FAR_DOOR_ITEMS: InstanceItem[] = [{ position: [0, 0, ARCHIVE_DOOR.depth / 2 + GAP], rotationY: -Math.PI / 2 }];

const ENTRANCE_FRAME = ARCHIVE_PATH.at(0);
const EXIT_FRAME = ARCHIVE_PATH.at(ARCHIVE_LENGTH);
/** 나가는 문의 자리(세상 좌표) — 문이 열리기 시작하는 거리를 이야기가 여기서 잰다 */
export const ARCHIVE_EXIT = { x: EXIT_FRAME.x, z: EXIT_FRAME.z } as const;

/** 들어서서 보는 곳 — 아홉 걸음 앞의 중심선. 끝이 아니라 **휘어 사라지는 벽**을 먼저 본다 */
export const ARCHIVE_FOCUS = (() => {
  const p = ARCHIVE_PATH.point(9);
  return { x: p.x, y: 1.6, z: p.z } as const;
})();

/* ─────────────────────────────── 벽 등 ─────────────────────────────── */

/**
 * 벽 등 — 8 m 마다 양쪽 벽 어깨 높이에 하나씩, 낮은 세기 (설계 02: 조명은 벽면만).
 * 벽에 붙은 등은 벽을 밝히고 바닥엔 비스듬히 닿아 어둡다 — 걷는 사람이 보는 것은 바닥이 아니라 양옆이다.
 * 세기는 복도(world2/corridor)의 3/4, 간격은 두 배: 그 사이의 어둠이 「끝이 없다」의 일부다.
 * 폭 3 → 4.5 (2026-09-03) 에 맞춰 2.4/7 → 3.0/8 로 했다가, 그것도 「어두워 밝게해줘」라 **7.0/10** (반구광 0.8 → 1.5) —
 * 헤드리스 평균 8/16/29 → 14/27/48. 세기는 이제 복도(6.4)보다 조금 세지만 간격이 두 배라 벽면당 빛은 여전히 복도 아래다.
 * 등을 더 촘촘히 안 세우는 이유: 4 m 마다면 s 30 에 등이 오고, 그러면 「금 열여섯」의 금 위에 등이 앉는다.
 * 자리는 s 2 부터 — 한가운데(30)를 피한다.
 */
const LAMP_SS: number[] = [];
for (let s = 2; s < ARCHIVE_LENGTH; s += 8) LAMP_SS.push(s);
const WALL_LIGHT = { lateral: WALL_X - 0.45, y: WALL_TOP_Y - 0.35, intensity: 7.0, distance: 10, decay: 1.6, color: '#9cc3ff' } as const;

interface ArcBox {
  s: number;
  lateral: number;
  y: number;
  scale: [number, number, number];
}

/** 리브 안쪽 면의 세로 발광 띠 — 키트의 ribStrips 와 같은 규격, 자리만 호 위 */
const STRIP_ITEMS: readonly ArcBox[] = RIB_SS.flatMap((s) =>
  SIDES.map((side): ArcBox => ({ s, lateral: side * (WALL_X - RIB.d - 0.012), y: (RIB_STRIP.y0 + RIB_STRIP.y1) / 2, scale: [0.024, RIB_STRIP.y1 - RIB_STRIP.y0, RIB_STRIP.w] })),
);
/** 벽 등의 몸 — 점광원이 어디서 나오는지 보여야 「벽면만」이 읽힌다 */
const LAMP_ITEMS: readonly ArcBox[] = LAMP_SS.flatMap((s) =>
  SIDES.map((side): ArcBox => ({ s, lateral: side * (WALL_X - 0.05), y: WALL_LIGHT.y, scale: [0.06, 0.32, 0.16] })),
);

/* ─────────────────────────────── 건물 ─────────────────────────────── */

/** 호를 따라 놓인 단위 상자들 — 같은 재질이면 인스턴스 하나 */
function ArcBoxes({ items, material, name }: { items: readonly ArcBox[]; material: THREE.Material; name: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const frame = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    items.forEach((it, i) => {
      local.makeScale(it.scale[0], it.scale[1], it.scale[2]).setPosition(it.lateral, it.y, 0);
      mesh.setMatrixAt(i, frameAt(it.s, frame).multiply(local));
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[undefined, material, items.length]} name={name}>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}

/** 격벽 리브 — 키트의 RibRun 과 같되 정거장마다 진행 방향으로 돌려 세운다 */
function ArcRibRun() {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const frame = new THREE.Matrix4();
    RIB_SS.forEach((s, i) => mesh.setMatrixAt(i, frameAt(s, frame)));
    mesh.count = RIB_SS.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);
  return <instancedMesh ref={ref} args={[RIB_GEO, STEEL_MAT, RIB_SS.length]} name="격벽 리브" />;
}

function ArcShell({ tex }: { tex: SciTextures }) {
  /** UV 가 이미 타일 단위라 반복 1 — 감싸기만 켠다 (끝벽과 같은 규칙) */
  const floorTex = useTiled(tex.floor, 1, 1);
  const grateTex = useTiled(tex.grate, 1, 1, false);
  const wallTex = useTiled(tex.wall, 1, 1);
  const ceilingTex = useTiled(tex.ceiling, 1, 1);
  const materials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ map: floorTex, color: SHELL_COLORS.floor, roughness: 0.92, metalness: 0 }),
      new THREE.MeshStandardMaterial({ map: grateTex, color: SHELL_COLORS.grate, roughness: 0.9, metalness: 0 }),
      new THREE.MeshStandardMaterial({ map: wallTex, color: SHELL_COLORS.wall, roughness: 0.9, metalness: 0 }),
      new THREE.MeshStandardMaterial({ map: wallTex, color: SHELL_COLORS.chamfer, roughness: 0.95, metalness: 0 }),
      new THREE.MeshStandardMaterial({ map: ceilingTex, color: SHELL_COLORS.ceiling, roughness: 0.95, metalness: 0 }),
    ],
    [floorTex, grateTex, wallTex, ceilingTex],
  );
  return <mesh name="휜 껍데기" geometry={SHELL_GEO} material={materials} />;
}

export function Archive(_props: { quality?: QualityTier }) {
  const tex = useSciTextures();
  const endTex = useTiled(tex.wall, 1, 1, false);
  const ringMat = useShapedMaterial('sci_bulkhead');
  const doorMat = useShapedMaterial('sci_blast_door');

  return (
    <group name="기록 복도">
      <ArcShell tex={tex} />
      <ArcRibRun />
      <ArcBoxes items={STRIP_ITEMS} material={STRIP_MAT} name="리브 띠" />
      <ArcBoxes items={LAMP_ITEMS} material={STRIP_MAT} name="벽 등" />

      {/* 양 끝 — 정거장 프레임(at(0) · at(60)) 안에 곧은 방의 끝벽·문간·링·문짝을 그대로 세운다 */}
      <group name="들어온 문" position={[ENTRANCE_FRAME.x, 0, ENTRANCE_FRAME.z]} rotation-y={ENTRANCE_FRAME.heading}>
        <mesh name="가까운 끝벽" geometry={END_WALL_GEO} rotation-y={WALL_ROT.near}>
          <meshStandardMaterial map={endTex} color={SHELL_COLORS.wall} roughness={0.9} metalness={0} />
        </mesh>
        <Doorway z={0} dir={1} opening={OPENING} />
        <Parts id="sci_bulkhead" fit={RING_FIT} items={NEAR_RING_ITEMS} material={ringMat} />
        <Parts id="sci_blast_door" fit={DOOR_FIT} items={NEAR_DOOR_ITEMS} material={doorMat} />
      </group>
      <group name="나가는 문" position={[EXIT_FRAME.x, 0, EXIT_FRAME.z]} rotation-y={EXIT_FRAME.heading}>
        <mesh name="먼 끝벽" geometry={END_WALL_GEO} rotation-y={WALL_ROT.far}>
          <meshStandardMaterial map={endTex} color={SHELL_COLORS.wall} roughness={0.9} metalness={0} />
        </mesh>
        <Doorway z={0} dir={-1} opening={OPENING} />
        <Parts id="sci_bulkhead" fit={RING_FIT} items={FAR_RING_ITEMS} material={ringMat} />
        <SlidingLeaf name="나가는 문짝" open={exitDoor.isOpen} h={ARCHIVE_DOOR.h} fit={DOOR_FIT} items={FAR_DOOR_ITEMS} material={doorMat} />
      </group>
    </group>
  );
}

/* ─────────────────────────────── 조명 ─────────────────────────────── */

/**
 * 반구광은 복도(1.8)보다 낮게 — 위에서 고루 내리는 빛이 세면 바닥이 벽만큼 밝아진다. 바닥이 벽보다 어두운 것은 유지된다 (헤드리스 확인).
 * 점광원은 벽 등 자리에만 (LAMP_SS × 양쪽 = 14). 그림 자체는 발광 재질이라 빛이 없어도 읽힌다 — 빛은 벽의 결을 위한 것이다.
 */
export function ArchiveLights(_props: { flicker: boolean }) {
  return (
    <>
      <hemisphereLight args={['#7f8fa6', '#171b22', 1.5]} />
      {LAMP_SS.flatMap((s) =>
        SIDES.map((side) => {
          const p = ARCHIVE_PATH.point(s, side * WALL_LIGHT.lateral);
          return (
            <pointLight
              key={`${side}:${s}`}
              position={[p.x, WALL_LIGHT.y, p.z]}
              intensity={WALL_LIGHT.intensity}
              distance={WALL_LIGHT.distance}
              decay={WALL_LIGHT.decay}
              color={WALL_LIGHT.color}
            />
          );
        }),
      )}
    </>
  );
}

/* ─────────────────────────────── 충돌 · 범위 ─────────────────────────────── */

const WALL_T = 1;
const WALL_TOP = 6;
/** 옆벽 충돌은 2 m 토막 — 반지름 23 m 에서 2 m 현의 처짐이 2 cm 라 곧은 상자로 충분하다. 이음매는 0.2 겹친다 */
const SEG = 2;

function makeColliders(): Collider[] {
  const out: Collider[] = [];
  for (let s0 = 0; s0 < ARCHIVE_LENGTH; s0 += SEG) {
    const s = s0 + SEG / 2;
    const heading = ARCHIVE_PATH.at(s).heading;
    for (const side of SIDES) {
      const p = ARCHIVE_PATH.point(s, side * (WALL_X + WALL_T / 2));
      out.push({ x: p.x, z: p.z, hw: WALL_T / 2, hd: SEG / 2 + 0.2, rot: heading, top: WALL_TOP });
    }
  }
  // 끝벽 — 문 프레임 뒤로 벽 두께의 반
  const behind = (f: PathPoint, sign: number) => ({ x: f.x + sign * -f.nz * (WALL_T / 2), z: f.z + sign * f.nx * (WALL_T / 2) });
  const near = behind(ENTRANCE_FRAME, -1);
  const far = behind(EXIT_FRAME, 1);
  out.push({ x: near.x, z: near.z, hw: WALL_X + 1, hd: WALL_T / 2, rot: ENTRANCE_FRAME.heading, top: WALL_TOP });
  out.push({ x: far.x, z: far.z, hw: WALL_X + 1, hd: WALL_T / 2, rot: EXIT_FRAME.heading, top: WALL_TOP });
  // 리브 — 벽에서 0.4 나온 아치 다리
  for (const s of RIB_SS) {
    const heading = ARCHIVE_PATH.at(s).heading;
    for (const side of SIDES) {
      const p = ARCHIVE_PATH.point(s, side * (WALL_X - RIB.d / 2));
      out.push({ x: p.x, z: p.z, hw: RIB.d / 2, hd: RIB.t / 2, rot: heading, top: WALL_TOP });
    }
  }
  return out;
}
const COLLIDERS: readonly Collider[] = makeColliders();

/**
 * 걸을 수 있는 범위 — 호가 본판 WORLD 클램프(x ±14 · z −23~15)를 한참 벗어나므로 이 방만 제 상자를 준다 (MapDef.bounds).
 * 벽은 여전히 충돌이 막는다. 상자는 벽 바깥으로 벽 두께만큼 여유
 */
export const ARCHIVE_BOUNDS = (() => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of STATIONS) {
    for (const side of SIDES) {
      const p = ARCHIVE_PATH.point(s, side * (WALL_X + WALL_T));
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
  }
  const pad = WALL_T;
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
})();

/**
 * 방의 요약 — 다른 방들과 같은 꼴(profile · m · colliders)에 길(path)이 더 있다.
 * ★ profile 의 farZ/nearZ 는 **펴 놓은 좌표**(−60 · 0)다. 세상 자리는 path 로 묻는다.
 */
export const ARCHIVE = {
  profile: PROFILE,
  m: M,
  path: ARCHIVE_PATH,
  length: ARCHIVE_LENGTH,
  /** bay 중심 · 리브 — 호 길이 s */
  bays: BAY_SS as readonly number[],
  ribs: RIB_SS as readonly number[],
  colliders: COLLIDERS,
} as const;

/** 그림이 걸리는 벽면까지의 거리 — ArchiveWall 이 sideAnchor 의 lift 기준으로 쓴다 */
export const ARCHIVE_WALL_X = WALL_X;

export function resolveArchiveColliders(p: THREE.Vector3, feetY: number) {
  const out = resolveCollisions(p.x, p.z, feetY, undefined, COLLIDERS);
  p.x = out.x;
  p.z = out.z;
}

export function archiveGroundHeightAt(x: number, z: number, fromY: number): number {
  return groundHeightWith(x, z, fromY, COLLIDERS);
}
