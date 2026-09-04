/**
 * 복도 — 시나리오 2 의 **첫 방.** 레벨 설계 「누가 듣고 있나」의 챕터 1 평면을 딛고: **10 × 40 m · L 자.**
 *
 * ★ 예전에는 본판(챕터 1)의 복도를 그대로 빌려 썼다. 그게 「설계대로 새 방이 나와야 하는데 챕터 1 방으로
 *   다시 들어간다」의 정체다 (2026-09-02 사용자). 같은 방을 두 판이 나눠 쓰면 두 가지가 깨진다 —
 *   설계서가 정한 치수(좁아서 소문이 안 퍼진다)가 안 지켜지고, 저쪽 격납문 상태를 이쪽이 건드린다.
 *
 * ★ 방을 **본판 복도만 하게 넓혔다** (2026-09-03 사용자: 「맵이 너무 작아 더 길게 · world1 복도 크기처럼 오픈월드 느낌으로」).
 *   폭 6 → **10**(본판 복도와 같은 wallX 5), 중심선 24 → **40 m**(첫 다리 16 · 꺾임 10 · 둘째 다리 14).
 *   본판 복도는 10 × 36 m 곧은 방이고, 이 방은 같은 폭에 더 길되 **꺾여 있다** — 한눈에 안 들어오는 것이 이 방의 전부다.
 *   벽화 여섯과 정비 단말은 **들어온 끝에서 같은 거리**에 그대로 둔다(리브 간격이 그 끝을 기준이라): 늘어난 길이는
 *   그림과 꺾임 **사이**의 빈 통로로 간다 — 걷는 시간이 길어지는 것이 「넓다」의 정체다.
 *   자리표(Room2Scene)와 순찰선은 새 벽을 따라 다시 잡았다. x 19 까지 뻗어 본판 경계(±14)를 넘으므로 이 방은 제 bounds 를 준다.
 *
 * ★ 폭이 설계의 4 가 아닌 내력 (2026-09-03). 4 m 에 걷는 것 셋과 서 있는 넷을 넣으니 사람이 지나갈 띠가 8 cm 였다 —
 *   걷는 것이 사람 앞에서 영영 멎고, 리브 옆에서 벽과 몸 사이에 끼었다. 「좁아서 소문이 안 퍼진다」는 목격 반경 6 m 가 말하고,
 *   폭은 **사람 하나와 개체 둘이 한 z 에 나란히 서도 지나갈 수 있는** 최소치로 잡는다: 0.87 × 2 + 몸 폭 + 리브 0.4 ≈ 6.
 *   폭을 6 으로 넓혀 꺾임 마디가 6 × 6 이 되고 중심선이 2 m 길어졌다 (22 → 24).
 *
 * ★ 곧은 24 m 가 아니라 **꺾인** 24 m 다. 곧으면 들어서는 순간 방 전체가 한눈에 들어와 「누가 듣고 있나」가
 *   질문이 안 된다 — 꺾임 뒤에 누가 있는지 모르는 것이 이 방의 긴장이고, 집행자도 거기서 나타난다.
 *   벽화는 **꺾임 안쪽 벽**(첫 다리의 오른쪽 벽 + 둘째 다리의 가까운 벽)에 건다: 정면으로 봐야 읽히므로
 *   그림을 보는 동안 순찰 통로에 등을 진다 (설계 01). 그게 「보는 것」이 값을 치르는 방식이다.
 *
 * 설계서가 정한 값:
 *   10 × 40 m(설계 4 × 22 → 6 × 24 → 위) · 천장 3.0 m · **목격 반경 6 m** · 체류 무제한 · 되돌아갈 수 있는 유일한 방
 *   01 벽화 여섯 장을 **꺾임 안쪽 벽**에 — 정면으로 봐야 읽히므로 순찰 통로에 등을 진다
 *   02 정비 단말은 진입부에 — 벽화보다 먼저 만나야 「번호」의 뜻을 안다
 *   03 순찰 40 초 왕복 — 꺾임을 돌아 끝에서 끝까지 (patrol.ts 가 CORRIDOR2_PATH 를 따른다)
 *   05 개체를 서로 **6 m 이상** 떼어 놓는다 — 한 개체에게 건 말이 옆으로 안 새게
 *
 * 좌표: 첫 다리는 월드 그대로(z 3 → −7), 꺾임 마디는 z −13 ~ −7 의 6 × 6, 둘째 다리는 **제 좌표계로 세워
 * −π/2 돌려** 꺾임의 +x 가장자리에서 x 11 까지 뻗는다. 곧은 8각 껍데기밖에 못 세우는 키트로 꺾임을 만드는 방법은
 * 그것뿐이다 — 껍데기 둘을 각각 곧게 세우고, 사이를 네모난 마디로 잇는다. 이음매는 격벽 리브가 가린다.
 * 부품은 본판과 같은 키트(world/map/scifi.tsx) — 새 방이 옛 방과 다른 시설처럼 보이면 「같은 구역」이 거짓이 된다.
 */

import type { ReactNode } from 'react';
import * as THREE from 'three';

import type { Fit, InstanceItem } from '@/world/map/corridor/part';
import { Parts, useTiled, type Item } from '@/world/map/parts';
import {
  Doorway,
  FLOOR_TILE,
  RibRun,
  SHELL_COLORS,
  SIDES,
  Shell,
  WALL_ROT,
  WALL_TILE,
  WallKit,
  dataScreens,
  makeEndWallGeometry,
  makeRibGeometry,
  openingFor,
  panelFaces,
  ribStrips,
  upperTubes,
  useSciTextures,
  useScreenMaterials,
  useShapedMaterial,
  wallTubes,
  type Metrics,
  type SciTextures,
  type TubeSet,
} from '@/world/map/scifi';
import { groundHeightAt as groundHeightWith, resolveCollisions, type Collider } from '@/world/mp/collide';
import type { QualityTier } from '@/world/perf/quality';

import { exitDoor } from './exitDoor';
import { SlidingLeaf } from './leaf';
import { GAP, NO_CONSOLES, RIB, RING_MODEL, keepSide, makeRoom, onSide, placeColliders, type Room } from './room';

/* ─────────────────────────────── 평면 ─────────────────────────────── */

/**
 * 폭 6 m(벽 안쪽 ±3) · 천장 3 m. 수직 벽은 2.6 까지 — 키트의 세로 튜브(y 1.55~2.65)가 경사면에 안 묻히는 최저치다.
 * 천장은 설계값(3.0)을 지킨다 — 폭이 늘어도 낮은 천장이 「통로」를 말한다. 8각 단면이라 어깨 위가 바로 꺾인다.
 * 사람이 지나갈 띠: 벽 충돌 뒤 중심 가능 x ±2.65, 리브 옆 ±2.25 — 개체 둘(0.87 씩)이 한 z 에 서도 남는다.
 */
const WALL_X = 5;
/**
 * 높이도 **본판 복도와 같은 수**로 올렸다 (2026-09-03 사용자: 「맵을 키운 만큼 높이도 비율적으로. 천장이 너무 낮잖아」).
 * 폭만 6 → 10 으로 넓히고 천장을 3 에 둔 판은 통로가 아니라 **눌린 방**이었다 — 8각 단면이라 어깨 위가 바로 꺾여서
 * 넓어진 폭이 전부 천장 경사면으로 갔다. 본판 복도(wallX 5)의 값 그대로: 수직 벽 3.4 · 천장 5.6 (경사면 45°, 천장 반폭 2.8).
 */
const WALL_TOP_Y = 3.4;
const CEILING_Y = 5.6;
const BAY = 3;

/** 첫 다리 — 들어온 문(z 4)에서 꺾임(z −12)까지 16 m. 먼 끝이 **뚫려** 꺾임 마디로 이어진다 */
const LEG1 = makeRoom({ wallX: WALL_X, farZ: -12, nearZ: 4, wallTopY: WALL_TOP_Y, ceilingY: CEILING_Y, bay: BAY, open: { far: true } });
/** 꺾임 마디 — 10 × 10 정사각(z −22 ~ −12). 첫 다리의 먼 끝에 바로 붙는다. 바깥 두 벽(서·북)만 막히고 두 다리 쪽은 열려 있다 */
const CORNER = { x: 0, z: LEG1.profile.farZ - WALL_X, half: WALL_X } as const;
/** 둘째 다리 — **제 좌표계**(z 가 길이)로 14 m. 가까운 끝(z 0)이 꺾임에 붙고, 먼 끝(z −14)이 나가는 문이다 */
const LEG2 = makeRoom({ wallX: WALL_X, farZ: -14, nearZ: 0, wallTopY: WALL_TOP_Y, ceilingY: CEILING_Y, bay: BAY, open: { near: true } });
/** 둘째 다리의 자리 — 꺾임의 +x 가장자리에서 +x 로 뻗는다. rotation.y −π/2 라 제 −z 가 월드 +x 다 */
const LEG2_AT = { x: CORNER.x + CORNER.half, z: CORNER.z, rot: -Math.PI / 2 } as const;
/** 둘째 다리 좌표 → 월드 (rotation.y −π/2: (x, z) → (−z, x) 뒤 평행이동) */
const leg2ToWorld = (x: number, z: number) => ({ x: LEG2_AT.x - z, z: LEG2_AT.z + x });

/** 나가는 문 — 둘째 다리의 먼 끝. 여기 닿으면 휴게 구역이다 */
export const CORRIDOR2_EXIT = leg2ToWorld(0, LEG2.profile.farZ);
/** 중심선 — 들어온 문 → 꺾임 → 나가는 문. 시험이 이 선의 길이(40 m)를 쥔다. 순찰은 이 선에서 0.6 비켜 걷는다 (patrol.ts) */
export const CORRIDOR2_PATH: readonly { x: number; z: number }[] = [
  { x: 0, z: LEG1.profile.nearZ },
  { x: CORNER.x, z: CORNER.z },
  CORRIDOR2_EXIT,
];
/** 벽면 x — 첫 다리의 벽. 단말이 여기 붙는다 */
export const CORRIDOR2_WALL_X = WALL_X;
/**
 * 정비 단말이 붙는 자리 — **진입부** 왼쪽 벽이다 (설계 02). 들어와서 두 걸음이면 왼쪽에 있다.
 * 벽화보다 먼저 만나야 「번호」가 무슨 뜻인지 알고 그림을 본다. **들어온 끝의 첫 칸 한가운데**(리브 0.8 과 문 링 사이)다 —
 * 방이 길어지며 리브 간격이 바뀌어 예전 자리(0.7)가 리브에 물렸다 (2026-09-03 사용자: 「단말 정보가 안 보인다」).
 */
export const CORRIDOR2_TAG_Z = 1.9;
/** 들어서서 보는 곳 — 꺾임의 북쪽 벽. 문이 안 보이는 것이 맞다: 어디로 가는지는 걸어가 봐야 안다 */
export const CORRIDOR2_FOCUS = { x: 0, y: 1.55, z: CORNER.z - CORNER.half + 1 } as const;

/** 나가는 문 앞 — 이 안에 들면 「문 앞」이다 (예전의 farZ + 1.6 과 같은 거리) */
const EXIT_REACH = 1.6;
export function corridor2AtExit(x: number, z: number): boolean {
  return Math.hypot(x - CORRIDOR2_EXIT.x, z - CORRIDOR2_EXIT.z) <= EXIT_REACH;
}

/** 이 점이 복도 바닥 안인가 — 벽에서 margin 만큼 들어온 자리만 「안」으로 친다 (순찰 자리 시험이 쓴다) */
export function corridor2Contains(x: number, z: number, margin = 0.4): boolean {
  const w = WALL_X - margin;
  const inLeg1 = Math.abs(x) <= w && z >= LEG1.profile.farZ && z <= LEG1.profile.nearZ - margin;
  const inCorner = x >= -w && x <= CORNER.x + CORNER.half && z >= CORNER.z - CORNER.half + margin && z <= CORNER.z + CORNER.half;
  const inLeg2 = x >= LEG2_AT.x && x <= CORRIDOR2_EXIT.x - margin && Math.abs(z - CORNER.z) <= w;
  return inLeg1 || inCorner || inLeg2;
}

/** 꺾은선의 길이 */
export function pathLength(path: readonly { x: number; z: number }[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i += 1) s += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  return s;
}

/** 벽에 거는 것의 자리 — 벽면의 점과, 그 벽의 정면이 방 안을 보게 하는 rotation.y. span 은 그 자리에 걸 수 있는 폭 */
export interface WallAnchor {
  x: number;
  z: number;
  rotY: number;
  span: number;
}

/** 둘째 다리의 안쪽 벽(제 좌표계 +x = 월드 z −7) 위의 한 점 */
const leg2Inner = (localZ: number, span: number): WallAnchor => ({
  ...leg2ToWorld(WALL_X, localZ),
  rotY: LEG2_AT.rot + WALL_ROT.right,
  span,
});

/**
 * 벽화 여섯 장의 자리 — **꺾임 안쪽 벽** (설계 01). 안쪽에서 바깥 순서다 (나가는 문 쪽이 0).
 * 첫 다리의 오른쪽 벽(x +3, 정면 −x)에 셋, 둘째 다리의 가까운 벽(z −7, 정면 −z)에 셋 —
 * 어느 장이든 정면으로 서면 통로에 등을 진다. 리브(±0.35)와 링·이음매 리브를 피한 빈 벽만이다.
 *
 * ★ 자리는 **리브 사이 한가운데**다 — 리브는 방의 끝에서 bay(3) 등분한 자리에 서므로(makeRoom), 방 길이가 바뀌면
 *   간격도 같이 바뀐다: 6 × 24 시절의 z 를 그대로 두었더니 그림이 리브에 반쯤 물렸다 (2026-09-03 사용자: 「그림이 약간 밀린 부분」).
 *   지금 첫 다리는 16 m/5 칸(리브 −8.8 · −5.6 · −2.4 · 0.8), 둘째 다리는 14 m/5 칸(−2.8 · −5.6 · −8.4 · −11.2)이고,
 *   여섯 장은 그 칸의 한가운데에 선다. 방을 다시 손보면 **리브부터 다시 세고** 여기를 옮긴다.
 *   폭(span)도 넓혔다 — 3.2 m 칸에 1.15 m 그림은 넓어진 벽에서 우표처럼 보인다.
 *
 * ★ rotY 의 뜻 (Murals 의 응시 판정이 여기서 법선을 만든다): 그림의 **정면 법선은 n = (sin rotY, 0, cos rotY)** — rotY 만큼 돌린 판의 +z 다.
 *   오른쪽 벽(WALL_ROT.right = −π/2)이면 n = (−1, 0, 0): 방 안(−x)을 본다. 둘째 다리의 안쪽 벽은 LEG2_AT.rot + WALL_ROT.right = −π 라
 *   n = (0, 0, −1): 월드 −z, 즉 통로 쪽을 본다. 좌표는 WALL_X·LEG2_AT 에서 파생되므로 폭을 바꾸면 여기가 따라온다 — 숫자를 베끼지 말 것.
 */
export const MURAL_WALL: readonly WallAnchor[] = [
  leg2Inner(-9.8, 2.1),
  leg2Inner(-7.0, 2.1),
  leg2Inner(-4.2, 2.1),
  // 첫 다리의 셋은 span 2.0 — 칸(3.2)의 한가운데에 걸되 **그림과 그림 사이에 몸 하나(0.84)가 설 자리**를 남긴다 (A-137 이 제 그림 곁에 선다)
  { x: WALL_X, z: -7.2, rotY: WALL_ROT.right, span: 2.0 },
  { x: WALL_X, z: -4.0, rotY: WALL_ROT.right, span: 2.0 },
  { x: WALL_X, z: -0.8, rotY: WALL_ROT.right, span: 2.0 },
];

/* ─────────────────────────────── 벽 · 문 ─────────────────────────────── */

/**
 * 천장이 5.6 으로 올라가며 문과 링도 같이 키웠다 (2.6 × 2.7 → 3.2 × 3.6 · 링 6.9 → 11.4):
 * 10 m 벽 한가운데 2.6 m 문은 벽에 난 구멍이지 격납문이 아니고, 링이 벽 폭에 못 미치면 문틀이 아니라 가구다.
 * 원래 **문도 링도 이 방 것을 따로 쓰는** 이유는 이것이었다 — 공용 격납문(3.6 × 3.7)은 끝벽의 8각 윤곽을 벗어나
 * 삼각분할이 깨지고, 문짝이 천장 위로 솟는다. 개구 높이 2.58 은 수직 벽(2.6) 안에 든다. 문 폭 2.6 은 그대로다 —
 * 방이 넓어졌지 문이 넓어진 게 아니다(들어오는 것은 하나씩이다).
 * 링은 벽보다 조금 넓게(6.17) 잡아 양 끝이 벽 속에 묻힌다 — 링이 벽에 못 닿고 떠 있으면 문틀이 아니라 가구다.
 * 균등 배율이라 링의 꼭대기(0.88 × 6.9 ≈ 6.1)는 천장 위다 — 천장 판이 가리므로 안에서는 양 기둥만 보인다 (4 m 시절의 4.05 도 그랬다).
 */
const CORRIDOR_DOOR = { w: 3.2, h: 3.6, depth: 0.3 } as const;
const CORRIDOR_RING = { scale: 11.4, sink: 0.12 * 11.4, thickness: 0.75 } as const;

const OPENING = openingFor(CORRIDOR_DOOR);
/** 두 다리의 단면이 같아 끝벽·리브 지오메트리는 하나로 나눠 쓴다 (길이는 안 들어간다) */
const END_WALL_GEO = makeEndWallGeometry(LEG1.m, undefined, OPENING);
const RIB_GEO = makeRibGeometry(LEG1.m, RIB);

/**
 * 이음매 리브 — 다리가 꺾임 마디에 붙는 자리에 리브를 하나씩 더 세운다. 다리의 경사면이 끝나고 마디의 곧은 벽이
 * 시작하는 단차를 리브(0.4 깊이)가 덮는다. 리브 두께의 절반만큼 다리 안쪽으로 들여 마디 공간에 판이 떠 있지 않게 한다.
 */
const LEG1_RIBS: readonly number[] = [...LEG1.ribs, LEG1.profile.farZ + RIB.t / 2];
const LEG2_RIBS: readonly number[] = [...LEG2.ribs, LEG2.profile.nearZ - RIB.t / 2];

/**
 * 벽 장식은 **그림 반대쪽 벽에만** 단다 — 첫 다리는 왼쪽(−x), 둘째 다리는 바깥쪽(제 −x = 월드 z −11).
 * 그림이 걸릴 벽(꺾임 안쪽)은 비운다 (설계 01). 첫 다리의 진입부 bay 는 단말 자리라 비우고,
 * 둘째 다리의 꺾임 쪽 bay 는 이음매 리브에 패널이 겹쳐서 비운다.
 */
const LEG1_DECOR = [LEG1.bays[0], LEG1.bays[1]];
const LEG2_DECOR = [LEG2.bays[0], LEG2.bays[1]];
const UPPER1 = upperTubes(LEG1.m, LEG1.bays);
const WALL1 = keepSide(wallTubes(LEG1.m, LEG1_DECOR), -1);
const SCREENS1 = onSide(dataScreens(LEG1.m, LEG1_DECOR), -1);
const PANELS1 = onSide(panelFaces(LEG1.m, LEG1_DECOR), -1);
const STRIPS1 = ribStrips(LEG1.m, LEG1.ribs, RIB);
const UPPER2 = upperTubes(LEG2.m, LEG2.bays);
const WALL2 = keepSide(wallTubes(LEG2.m, LEG2_DECOR), -1);
const SCREENS2 = onSide(dataScreens(LEG2.m, LEG2_DECOR), -1);
const PANELS2 = onSide(panelFaces(LEG2.m, LEG2_DECOR), -1);
const STRIPS2 = ribStrips(LEG2.m, LEG2.ribs, RIB);

const RING_FIT: Fit = { x: CORRIDOR_RING.thickness, y: RING_MODEL.h * CORRIDOR_RING.scale, z: RING_MODEL.w * CORRIDOR_RING.scale };
/** 들어온 문의 링 (첫 다리 좌표) */
const NEAR_RING_ITEMS: InstanceItem[] = [
  { position: [0, -CORRIDOR_RING.sink, LEG1.profile.nearZ - CORRIDOR_RING.thickness / 2], rotationY: Math.PI / 2 },
];
/** 나가는 문의 링 (둘째 다리 좌표) */
const FAR_RING_ITEMS: InstanceItem[] = [
  { position: [0, -CORRIDOR_RING.sink, LEG2.profile.farZ + CORRIDOR_RING.thickness / 2], rotationY: Math.PI / 2 },
];
const DOOR_FIT: Fit = { x: CORRIDOR_DOOR.depth, y: CORRIDOR_DOOR.h, z: CORRIDOR_DOOR.w };
/** 들어온 문은 닫힌 채다 */
const NEAR_DOOR_ITEMS: InstanceItem[] = [
  { position: [0, 0, LEG1.profile.nearZ - CORRIDOR_DOOR.depth / 2 - GAP], rotationY: Math.PI / 2 },
];
/** 나가는 격납문 (둘째 다리 좌표) — [E] 로 열기 전까지 닫혀 있다 (corridor.doorOpened → scenario2 canLeave → exitDoor). 「격납문 앞에서」가 진짜 문 앞이어야 선택이 선다 */
const FAR_DOOR_ITEMS: InstanceItem[] = [
  { position: [0, 0, LEG2.profile.farZ + CORRIDOR_DOOR.depth / 2 + GAP], rotationY: -Math.PI / 2 },
];

/** 발치의 낮은 배관 — 좁은 통로에 두께를 준다. 지나갈 수는 있게 벽에 바짝 붙인다. 다리마다 제 좌표계로 */
const PIPE_MAT = new THREE.MeshStandardMaterial({ color: '#222a35', roughness: 0.7, metalness: 0.55 });
const pipesOf = (room: Room): Item[] =>
  SIDES.map((s): Item => ({
    position: [s * (room.profile.wallX - 0.13), 0.3, room.midZ],
    scale: [0.22, 0.24, room.m.length - 1.4],
  }));
const PIPES1 = pipesOf(LEG1);
const PIPES2 = pipesOf(LEG2);

/**
 * 꺾임 마디의 윗귀 덮개 — 마디의 단면은 6 × 3 네모인데 다리의 단면은 어깨가 깎인 8각이라, 다리가 마디에 붙는 면에서
 * 양 윗귀에 세모 구멍이 난다. 그 둘을 막는 판. 안 막으면 그 틈으로 안개색 허공이 보인다.
 */
function makeCapGeometry(m: Metrics): THREE.BufferGeometry {
  const tri = (s: number) => [s * m.wallX, m.wallTopY, 0, s * m.wallX, m.ceilingY, 0, s * m.ceilHalf, m.ceilingY, 0];
  const pos = [...tri(-1), ...tri(1)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // UV 는 끝벽과 같은 규칙(월드 m / 타일) — 맨살 판은 텍스처 벽보다 훨씬 밝게 튀어서 구멍처럼 보인다
  const uv: number[] = [];
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] / WALL_TILE, pos[i + 1] / WALL_TILE);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
const CAP_GEO = makeCapGeometry(LEG1.m);

/* ─────────────────────────────── 건물 ─────────────────────────────── */

/** 곧은 다리 하나 — 껍데기·리브·벽 장식·배관. 두 다리가 같은 부품을 쓰되 장식 벌만 다르다 */
function Leg({
  room,
  tex,
  ribs,
  upper,
  wall,
  screens,
  panels,
  strips,
  pipes,
  skipFar,
  skipNear,
  consoleMaterial,
  screenMaterials,
  children,
}: {
  room: Room;
  tex: SciTextures;
  ribs: readonly number[];
  upper: TubeSet;
  wall: TubeSet;
  screens: Item[];
  panels: Item[];
  strips: Item[];
  pipes: Item[];
  skipFar?: boolean;
  skipNear?: boolean;
  consoleMaterial: THREE.Material;
  screenMaterials: { screen: THREE.Material; panel: THREE.Material };
  children?: ReactNode;
}) {
  return (
    <>
      <Shell m={room.m} tex={tex} endWall={END_WALL_GEO} skipFar={skipFar} skipNear={skipNear} />
      <RibRun geometry={RIB_GEO} zs={ribs} />
      <WallKit
        upper={upper}
        wall={wall}
        screens={screens}
        panels={panels}
        strips={strips}
        consoles={NO_CONSOLES}
        consoleMaterial={consoleMaterial}
        screenMaterials={screenMaterials}
      />
      {pipes.map((p, i) => (
        <mesh key={i} position={p.position} material={PIPE_MAT}>
          <boxGeometry args={p.scale} />
        </mesh>
      ))}
      {children}
    </>
  );
}

/** 꺾임 마디 — 바닥·천장·바깥 두 벽. 다리 쪽 두 면은 열려 있고, 윗귀만 덮개로 막는다 */
function CornerNode({ tex }: { tex: SciTextures }) {
  const size = CORNER.half * 2;
  const floorTex = useTiled(tex.floor, size / FLOOR_TILE, size / FLOOR_TILE);
  const wallTex = useTiled(tex.wall, size / WALL_TILE, CEILING_Y / WALL_TILE);
  const ceilingTex = useTiled(tex.ceiling, size / 2.4, size / 4.8);
  /** 윗귀 덮개는 UV 가 월드 m/WALL_TILE 이라 반복 1 — 끝벽과 같다 */
  const capTex = useTiled(tex.wall, 1, 1, false);
  return (
    <group name="꺾임 마디" position={[CORNER.x, 0, CORNER.z]}>
      <mesh name="바닥" rotation-x={-Math.PI / 2}>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial map={floorTex} color={SHELL_COLORS.floor} roughness={0.92} metalness={0} />
      </mesh>
      <mesh name="천장" position={[0, CEILING_Y, 0]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial map={ceilingTex} color={SHELL_COLORS.ceiling} roughness={0.95} metalness={0} />
      </mesh>
      <mesh name="바깥 벽 (서)" position={[-CORNER.half, CEILING_Y / 2, 0]} rotation-y={WALL_ROT.left}>
        <planeGeometry args={[size, CEILING_Y]} />
        <meshStandardMaterial map={wallTex} color={SHELL_COLORS.wall} roughness={0.9} metalness={0} />
      </mesh>
      <mesh name="바깥 벽 (북)" position={[0, CEILING_Y / 2, -CORNER.half]} rotation-y={WALL_ROT.far}>
        <planeGeometry args={[size, CEILING_Y]} />
        <meshStandardMaterial map={wallTex} color={SHELL_COLORS.wall} roughness={0.9} metalness={0} />
      </mesh>
      {/* 윗귀 덮개 — 첫 다리가 붙는 면(z −7)과 둘째 다리가 붙는 면(x +3) */}
      <mesh name="윗귀 덮개 (남)" geometry={CAP_GEO} position={[0, 0, CORNER.half]}>
        <meshStandardMaterial map={capTex} color={SHELL_COLORS.wall} roughness={0.9} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      <mesh name="윗귀 덮개 (동)" geometry={CAP_GEO} position={[CORNER.half, 0, 0]} rotation-y={WALL_ROT.right}>
        <meshStandardMaterial map={capTex} color={SHELL_COLORS.wall} roughness={0.9} metalness={0} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function Corridor2(_props: { quality?: QualityTier }) {
  const tex = useSciTextures();
  const screenMats = useScreenMaterials(tex.console);
  const ringMat = useShapedMaterial('sci_bulkhead');
  const doorMat = useShapedMaterial('sci_blast_door');

  return (
    <group name="복도(시나리오 2)">
      <group name="첫 다리">
        <Leg
          room={LEG1}
          tex={tex}
          ribs={LEG1_RIBS}
          upper={UPPER1}
          wall={WALL1}
          screens={SCREENS1}
          panels={PANELS1}
          strips={STRIPS1}
          pipes={PIPES1}
          skipFar
          consoleMaterial={doorMat}
          screenMaterials={screenMats}
        >
          <Doorway z={LEG1.profile.nearZ} dir={1} opening={OPENING} />
          <Parts id="sci_bulkhead" fit={RING_FIT} items={NEAR_RING_ITEMS} material={ringMat} />
          <Parts id="sci_blast_door" fit={DOOR_FIT} items={NEAR_DOOR_ITEMS} material={doorMat} />
        </Leg>
      </group>

      <CornerNode tex={tex} />

      <group name="둘째 다리" position={[LEG2_AT.x, 0, LEG2_AT.z]} rotation-y={LEG2_AT.rot}>
        <Leg
          room={LEG2}
          tex={tex}
          ribs={LEG2_RIBS}
          upper={UPPER2}
          wall={WALL2}
          screens={SCREENS2}
          panels={PANELS2}
          strips={STRIPS2}
          pipes={PIPES2}
          skipNear
          consoleMaterial={doorMat}
          screenMaterials={screenMats}
        >
          <Doorway z={LEG2.profile.farZ} dir={-1} opening={OPENING} />
          <Parts id="sci_bulkhead" fit={RING_FIT} items={FAR_RING_ITEMS} material={ringMat} />
          <SlidingLeaf name="나가는 격납문" open={exitDoor.isOpen} h={CORRIDOR_DOOR.h} fit={DOOR_FIT} items={FAR_DOOR_ITEMS} material={doorMat} />
        </Leg>
      </group>
    </group>
  );
}

/* ─────────────────────────────── 조명 ─────────────────────────────── */

/**
 * 벽면 간접 조명 (설계: 조명 벽면 간접). 천장 한가운데가 아니라 **양 벽 어깨 아래**에 건다 —
 * 빛이 벽을 타고 내려와야 그림이 읽히고, 통로 한가운데는 그보다 어둡다. 세기는 본판 복도의 절반씩 둘.
 * 폭이 6 이라 3.4/6.5 → 4.0/9 로 (2026-09-03) — 헤드리스 평균(tools/scenario2-shots.mjs)이 4 m 시절 29/45/71 에서 23/37/58 로 떨어진 만큼만 되돌렸는데,
 * 그 4 m 시절 값도 사용자에게는 어두웠다(「어두워 밝게해줘」). 그래서 4.0/9 → **6.4/10**, 반구광 1.5 → 1.8: 평균 23/38/61 → 31/49/76.
 * 한가운데가 벽보다 어두운 것은 그대로다 — 등은 여전히 벽 어깨에 있고, 세기만 올랐다. 발광 계수·블룸은 안 건드린다 (키트 규칙).
 */
const WALL_LIGHT = { x: WALL_X - 0.45, y: WALL_TOP_Y - 0.3, intensity: 6.4, distance: 10, decay: 1.6, color: '#9cc3ff' } as const;

function LegLights({ room }: { room: Room }) {
  return (
    <>
      {room.bays.flatMap((z) =>
        SIDES.map((s) => (
          <pointLight
            key={`${s}:${z}`}
            position={[s * WALL_LIGHT.x, WALL_LIGHT.y, z]}
            intensity={WALL_LIGHT.intensity}
            distance={WALL_LIGHT.distance}
            decay={WALL_LIGHT.decay}
            color={WALL_LIGHT.color}
          />
        )),
      )}
    </>
  );
}

export function Corridor2Lights(_props: { flicker: boolean }) {
  return (
    <>
      <hemisphereLight args={['#a4b6cf', '#2a313c', 1.8]} />
      <LegLights room={LEG1} />
      <group position={[LEG2_AT.x, 0, LEG2_AT.z]} rotation-y={LEG2_AT.rot}>
        <LegLights room={LEG2} />
      </group>
      {/* 꺾임 마디 — bay 하나처럼 양 벽에 한 쌍. 여기가 어두우면 귀퉁이에 선 것(A-089)이 안 읽힌다 */}
      {SIDES.map((s) => (
        <pointLight
          key={s}
          position={[CORNER.x + s * WALL_LIGHT.x, WALL_LIGHT.y, CORNER.z]}
          intensity={WALL_LIGHT.intensity}
          distance={WALL_LIGHT.distance}
          decay={WALL_LIGHT.decay}
          color={WALL_LIGHT.color}
        />
      ))}
    </>
  );
}

/* ─────────────────────────────── 충돌 ─────────────────────────────── */

const WALL_TOP = 6;
const pipeColliders = (pipes: Item[]): Collider[] =>
  pipes.map((p) => ({ x: p.position[0], z: p.position[2], hw: p.scale[0] / 2, hd: p.scale[2] / 2, rot: 0, top: p.scale[1] }));

/** 꺾임 마디의 바깥 두 벽 — 첫 다리의 왼쪽 벽과 둘째 다리의 바깥 벽 사이를 잇는다 */
const CORNER_COLLIDERS: Collider[] = [
  { x: -(WALL_X + 0.5), z: CORNER.z - 0.5, hw: 0.5, hd: CORNER.half + 0.5, rot: 0, top: WALL_TOP },
  { x: -0.5, z: CORNER.z - CORNER.half - 0.5, hw: CORNER.half + 0.5, hd: 0.5, rot: 0, top: WALL_TOP },
];

const COLLIDERS: readonly Collider[] = [
  ...LEG1.colliders,
  ...pipeColliders(PIPES1),
  ...CORNER_COLLIDERS,
  ...placeColliders([...LEG2.colliders, ...pipeColliders(PIPES2)], LEG2_AT),
];

/**
 * 방 하나로 읽는 값들. `profile` 은 **첫 다리**의 것이다 — wallX 는 온 방의 폭, nearZ 는 들어온 문,
 * **farZ 는 방 끝이 아니라 꺾임이 시작하는 z** 다. 방 끝은 CORRIDOR2_EXIT, 길이는 CORRIDOR2_PATH 가 말한다.
 */
export const CORRIDOR2 = {
  ...LEG1,
  colliders: COLLIDERS,
  corner: CORNER,
  leg2: LEG2,
  leg2At: LEG2_AT,
  path: CORRIDOR2_PATH,
  exit: CORRIDOR2_EXIT,
} as const;

export function resolveCorridor2Colliders(p: THREE.Vector3, feetY: number) {
  const out = resolveCollisions(p.x, p.z, feetY, undefined, COLLIDERS);
  p.x = out.x;
  p.z = out.z;
}

export function corridor2GroundHeightAt(x: number, z: number, fromY: number): number {
  return groundHeightWith(x, z, fromY, COLLIDERS);
}
