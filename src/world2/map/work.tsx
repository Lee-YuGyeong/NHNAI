/**
 * 작업 구역 — 시나리오 2 에서 **가장 크고 가장 값이 나가는 방**. 벽화 `danger` 가 그린 일이 눈앞에서 실제로 일어난다.
 *
 * 복도의 그림에서 개체 하나가 불 속으로 걸어 들어가고 사람은 선 밖에서 손가락질만 한다. 그 그림이 이 방의 도면이다:
 * 화물이 컨베이어를 타고 먼 끝의 소각로로 들어가고, 개체들이 그것을 나른다. 아무도 안 막는다 — 그게 절차이기 때문이다.
 *
 * 플레이어는 막을 수 있다. 막으면 **AI 가 절대 안 하는 행동**을 한 것이라 의심도가 크게 오르고, 본 개체 전원의 태도가 오른다
 * (features/world2/scenario2.ts 의 작업 구역 장면). 이 방이 「위로」를 「행동」으로 올리는 자리다 —
 * 여태 산 친밀도는 전부 말 한 마디였고, 여기서 처음으로 몸으로 값을 치른다.
 *
 * 방 자체는 아무 판정도 하지 않는다. 여기 있는 것은 불과 상자와 컨베이어뿐이다.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

import type { Fit, InstanceItem } from '@/world/map/corridor/part';
import { Instanced, Parts, type Item } from '@/world/map/parts';
import {
  Doorway,
  RibRun,
  Shell,
  WallKit,
  dataScreens,
  hdr,
  makeEndWallGeometry,
  makeRibGeometry,
  openingFor,
  panelFaces,
  ribStrips,
  sideConsoles,
  sideRot,
  upperTubes,
  useSciTextures,
  useScreenMaterials,
  useShapedMaterial,
  wallTubes,
  type TubeSet,
} from '@/world/map/scifi';
import { groundHeightAt as groundHeightWith, resolveCollisions } from '@/world/mp/collide';
import type { QualityTier } from '@/world/perf/quality';

import { exitDoor } from './exitDoor';
import { SlidingLeaf } from './leaf';
import { DOOR, GAP, RIB, RING, RING_MODEL, boxCollider, consoleColliders, makeRoom } from './room';

/* ─────────────────────────────── 방 ─────────────────────────────── */

/**
 * **10 × 34 m** — 레벨 설계 「누가 듣고 있나」는 8 × 34 라고 적었다 (2026-09-02 사용자: 「기획에 어긋난 맵이 있는지」).
 * 한때 24 × 28 로 지었는데, 이 방의 전부는 **하나의 거리**다: 내 작업 위치(z = 0)에서 소각로까지 **26 m**,
 * 뛰어서 8 초. 그 8 초가 THE_FURNACE 의 제한시간이고, 그래서 타이머를 따로 안 만든다.
 * 길이는 그 시계라 못 건드린다. 폭만 8 → 10 (2026-09-03): 8 m 중 벨트와 상자를 빼면 실제 통로가 2.95 m 라
 * 사람·순찰·배경·기다리는 A-201 이 한 차선을 나눠 썼다. 상자를 벽에 붙이고(x 4.3) 벨트를 넘을 수 있게 낮춰(0.5) 통로가 둘이 된다.
 */
export const WORK = makeRoom({ wallX: 5, farZ: -26, nearZ: 8, wallTopY: 3.0, ceilingY: 4.4, bay: 4.25 });
const { m: M, bays: BAYS, ribs: RIB_ZS } = WORK;

/** 들어오면 불을 보고 시작한다 — 이 방이 무엇을 하는 곳인지 묻지 않아도 알게 */
export const WORK_FOCUS = { x: 0, y: 1.8, z: -25 } as const;

/* ── 소각로 ── */

/**
 * 먼 끝벽 한가운데의 개구. 안은 안 보여 준다 — 붉은 빛과 검은 목구멍뿐이다.
 * 앞의 `MOUTH_Z` 는 **개체가 걸어 들어가는 선**이다 (features/world2 가 이 값을 쓴다).
 */
export const FIRE = { w: 3.0, h: 2.6, z: WORK.profile.farZ } as const;
export const FIRE_MOUTH_Z = FIRE.z + 1.6;
/** 불 앞에서 걸음을 멈춰야 하는 자리 — 여기까지가 플레이어가 개입할 수 있는 거리다 */
export const FIRE_STOP_Z = FIRE.z + 3.4;

/** 벨트의 양 끝 — 소각로 목구멍 앞에서 들어온 문 앞까지. 자리(WORK_012_SPOT)가 이 값을 쓰므로 먼저 적는다 */
const BELT_Z0 = FIRE.z + 2.0;
const BELT_Z1 = WORK.profile.nearZ - 1.0;

/* ── 자리 — 이 방이 정하는 세 자리 (features/world2/Room2Scene 이 쓴다) ── */

/**
 * 내 작업 위치 — **소각로에서 정확히 26 m** (레벨 설계 01). 벨트 오른쪽 가장자리(x −1.45)에 붙어 선다.
 * 바닥에 네모 하나가 그어져 있다(STATION_MARK) — 「여기가 내 자리」를 대사 없이 알린다.
 */
export const WORK_STATION = { x: -0.9, z: FIRE.z + 26 } as const;
/**
 * A-063 의 자리 — **소각로 바로 옆 벽에 등을 붙이고** (레벨 설계 04). 목구멍(x ±1.5, z −26~−22.6) 과 오른쪽 벽(x 5) 사이,
 * 플레이어가 오른쪽 통로로 뛰면 그 앞을 지나간다. 가장 가까운 상자(z −20.6)와는 2.2 m — 그 사이로 사람이 든다.
 */
export const WORK_063_SPOT = { x: 4.3, z: FIRE.z + 2.4 } as const;
/**
 * A-012 의 자리 — **라인 최선두**, 가장 무거운 것이 처음 올라오는 자리 (레벨 설계 05). 벨트 머리의 덮개(HOOD) 옆이다.
 * 들어온 문에서 1.6 m 라 스폰(index.ts SPAWN2.work)이 이 자리에서 2.6 m 밖에 있어야 들어서자마자 「곁」이 되지 않는다.
 */
export const WORK_012_SPOT = { x: -0.9, z: BELT_Z1 - 0.6 } as const;
/**
 * 측벽의 memorial 그림 자리 — 오른쪽 벽(x +5), 리브(z −9 · −13.25)와 bay 화면(z −11.1 · y 1.9 위) 사이의 빈 벽.
 * 복도에서 열다섯을 센 그 그림이 여기 또 걸려 있고, 소각로가 끝나면 금이 하나 는다 (features/world2/Room2Scene 이 건다 — 방은 세지 않는다).
 * 낮게(y 1.3) 건다 — 이 방에서 그림은 일하다 고개를 돌려야 보이는 것이지, 정면에 걸린 것이 아니다
 */
export const WORK_MEMORIAL = { side: 1 as const, z: -10.2, y: 1.3, w: 1.3, lift: 0.1 } as const;

/* ── 나가는 문 ── */

/**
 * 레벨 설계의 「출구」 — 소각로 곁 **왼쪽 옆벽**(−x). 끝벽은 불이라 못 뚫고(END_WALL_GEO), A-063 은 오른쪽 벽에 등을 붙이고 있어 그 반대편이다.
 * 한때 문이 없었다: 「z ≤ −20.8 이면 나간다」가 폭 전체에 걸려 있어 불 앞으로 뛰어가다 방이 바뀌었다 (2026-09-03 사용자: 「문이 없는 곳이 있다」).
 * 마지막 bay(z −26 ~ −21.75) 안, 문 폭 2.6 이 리브(−21.75 ± 0.35)에 안 닿는 자리. 문 앞 반경(EXIT_REACH)이 곧 「나가는 자리」다.
 * 수직 벽이 3.0 이라 공용 격납문(3.7)은 안 들어간다 — 이 방 것을 따로 쓴다. 링은 꼭대기(0.88 × scale)가 벽 위 경사면에 안 닿는 가장 큰 값.
 */
export const WORK_EXIT = { x: -WORK.profile.wallX, z: -23.3 } as const;
const EXIT_REACH = 2.2;
export function workAtExit(x: number, z: number): boolean {
  return Math.hypot(x - WORK_EXIT.x, z - WORK_EXIT.z) <= EXIT_REACH;
}
const SIDE_DOOR = { w: 2.6, h: 2.8, depth: 0.3 } as const;
const SIDE_RING = { scale: 3.4, sink: 0.12 * 3.4, thickness: 0.7 } as const;

const FIRE_MAT = new THREE.MeshBasicMaterial({ color: hdr('#ff6a2a', 1.35), toneMapped: false });
/**
 * 뽑아 세운 화구(에셋 incinerator) 의 실제 치수. 원본은 [0.794(깊이) × 1(높이) × 1(폭)] 로 정규화 — 정면이 로컬 +x.
 * 폭·높이 3.8: 끝벽(수직 3.0 · 평천장 4.4 는 ±3.6 까지)에 안 닿는 큰 값 — 들어서자마자 이 방의 문장이 보여야 한다.
 * 깊이만 1.6 으로 눌렀다(자연비 ≈3.0): 화구 **앞면이 개체가 사라지는 선**(FIRE_MOUTH_Z)에 서야
 * 걸어 들어간 개체가 강판을 뚫는 그림이 안 나온다 — 입에 닿는 순간 사라진다.
 */
const INCIN = { w: 3.8, h: 3.8, d: 1.6 } as const;
const INCIN_FIT: Fit = { x: INCIN.d, y: INCIN.h, z: INCIN.w };
/** 소각로 그룹(z = FIRE.z) 안의 상대 좌표 — 등을 끝벽에 2 cm 묻는다. position 은 발밑 점(Parts 가 보정) */
const INCIN_ITEMS: InstanceItem[] = [{ position: [0, 0, INCIN.d / 2 - 0.02], rotationY: -Math.PI / 2 }];

/* ── 컨베이어 ── */

/**
 * **한 방향 한 줄**이다 (레벨 설계: 「라인 한 방향 · 소각로 끝」). 왼쪽으로 붙여 놓아 오른쪽이 통로가 된다 —
 * 뛰어서 8 초가 성립하려면 소각로까지 **막히지 않은 직선**이 하나 있어야 한다.
 * 낮게 — **넘어 다닐 수 있어야** 「막을 수 있다」가 거짓말이 안 된다. 0.5 는 STEP_UP(collide.ts 0.55) 아래라 걸어서 넘는다;
 * 한때 0.62 라 못 넘었고 왼쪽 반이 죽은 땅이었다. 소각로 목구멍은 따로 막는다(아래 충돌) — 벨트 위로 불까지는 못 간다.
 */
export const BELTS = [{ x: -2.3, z0: BELT_Z0, z1: BELT_Z1 }] as const;
export const BELT = { w: 1.7, h: 0.5 } as const;
/**
 * 벨트 속도 — **절대 안 멈춘다** (레벨 설계 03: 「막든 안 막든 라인이 안 멈춘다는 걸 눈으로 계속 보여 준다」).
 * 불로 걸어 들어가는 개체(Unit.tsx FIRE_WALK 0.85)보다 느리다 — 개체가 화물보다 먼저 닿아야 「순서를 따른다」가 보인다.
 */
export const BELT_SPEED = 0.55;
/** 벨트 위 가로 살의 간격 — 이게 흐르는 것이 「움직인다」의 전부다. 화물은 드문드문이라 그것만으로는 안 읽힌다 */
const SLAT_PITCH = 0.5;
/** 벨트 양 끝의 덮개 — 화물이 여기 들어가서 사라지고 여기서 나온다. 되감기는 이 안에서 한다 (튀어나오는 걸 안 보이려고) */
const HOOD = { w: BELT.w + 0.4, h: 1.5, d: 1.6 } as const;
const HOOD_ZS = [BELT_Z0 + HOOD.d / 2, BELT_Z1 - HOOD.d / 2] as const;

const BELT_MAT = new THREE.MeshStandardMaterial({ color: '#232a33', roughness: 0.85, metalness: 0.3 });
const BELT_ITEMS: Item[] = BELTS.map((b): Item => ({ position: [b.x, BELT.h / 2, (b.z0 + b.z1) / 2], scale: [BELT.w, BELT.h, b.z1 - b.z0] }));
/** 벨트 옆면의 주행 띠 — 이건 안 움직인다. 움직이는 것은 그 위의 살과 화물이다 (BeltFlow) */
const BELT_STRIP_MAT = new THREE.MeshBasicMaterial({ color: hdr('#c8873a', 0.55), toneMapped: false });
const BELT_STRIPS: Item[] = BELTS.flatMap((b) =>
  [-1, 1].map((s): Item => ({ position: [b.x + s * (BELT.w / 2 + 0.012), BELT.h - 0.14, (b.z0 + b.z1) / 2], scale: [0.024, 0.06, b.z1 - b.z0 - 0.3] })),
);
const SLAT_MAT = new THREE.MeshStandardMaterial({ color: '#3a4450', roughness: 0.7, metalness: 0.5 });
const HOOD_MAT = new THREE.MeshStandardMaterial({ color: '#1a2027', roughness: 0.8, metalness: 0.4 });
const HOOD_ITEMS: Item[] = HOOD_ZS.map((z): Item => ({ position: [BELTS[0].x, HOOD.h / 2, z], scale: [HOOD.w, HOOD.h, HOOD.d] }));
/** 벨트 위를 흐르는 화물 — 상자와 같은 이유로 크기가 제각각. 여덟 개가 31 m 를 도는 동안 세 개쯤이 눈에 들어온다 */
const LOADS = [
  { at: 0.0, w: 0.9, h: 0.7, d: 1.1 },
  { at: 3.6, w: 0.7, h: 0.5, d: 0.8 },
  { at: 8.4, w: 1.0, h: 0.9, d: 1.0 },
  { at: 11.5, w: 0.6, h: 0.4, d: 0.7 },
  { at: 16.0, w: 0.9, h: 0.6, d: 1.2 },
  { at: 20.7, w: 0.8, h: 0.8, d: 0.8 },
  { at: 24.3, w: 0.7, h: 0.5, d: 1.0 },
  { at: 28.0, w: 1.0, h: 0.7, d: 0.9 },
] as const;

/* ── 화물 ── */

/**
 * 나르는 것들. 크기가 제각각인 것이 중요하다 — 규격이 같으면 기계가 나르는 것처럼 보인다.
 * **벽에 바짝 붙여 둔다**(오른쪽 왼면 ≥ 3.5, 왼쪽은 벨트 너머) — 가운데를 비워야 소각로까지 뛰는 길이 남는다 (그 길이 이 방의 제한시간이다).
 * z 는 리브(4.25 마다 ±0.35)와 콘솔 bay(z −15.4 · 1.6, 길이 2.4)를 피한 자리다 — 벽에 붙이니 리브를 관통하던 상자가 드러났다.
 */
export const CRATES = [
  { x: 4.3, z: -20.6, w: 1.5, d: 1.5, h: 1.5 },
  { x: 4.3, z: -18.7, w: 1.3, d: 1.4, h: 0.9 },
  { x: 4.3, z: -12.2, w: 1.6, d: 1.6, h: 2.0 },
  { x: 4.3, z: -6.4, w: 1.4, d: 1.7, h: 1.2 },
  { x: 4.3, z: -2.4, w: 1.6, d: 1.5, h: 1.7 },
  { x: 4.3, z: 5.6, w: 1.3, d: 1.5, h: 0.9 },
  { x: -4.3, z: -18.6, w: 1.2, d: 1.3, h: 0.8 },
  { x: -4.3, z: -10.4, w: 1.3, d: 1.4, h: 1.3 },
] as const;

const CRATE_MAT = new THREE.MeshStandardMaterial({ color: '#39424e', roughness: 0.9, metalness: 0.2 });
const CRATE_ITEMS: Item[] = CRATES.map((c): Item => ({ position: [c.x, c.h / 2, c.z], scale: [c.w, c.h, c.d] }));
/** 상자 앞면의 표시등 하나 — 번호가 붙어 있다는 뜻만. 글자는 안 쓴다 (읽을 것을 늘리지 않는다) */
const CRATE_DOT_MAT = new THREE.MeshBasicMaterial({ color: hdr('#7fa8d8', 0.6), toneMapped: false });
const CRATE_DOTS: Item[] = CRATES.map((c): Item => ({ position: [c.x, c.h * 0.72, c.z + c.d / 2 + 0.012], scale: [0.26, 0.05, 0.024] }));

/* ── 내 자리 ── */

/** 바닥에 그은 네모 — 벨트 띠와 같은 주황. 글자는 없다. 서 있어야 할 자리는 시설이 정한다 */
const MARK_MAT = new THREE.MeshBasicMaterial({ color: hdr('#c8873a', 0.5), toneMapped: false });
const MARK = { w: 1.3, d: 1.3, t: 0.04, y: 0.008 } as const;
const STATION_MARK: Item[] = [
  { position: [WORK_STATION.x, MARK.y, WORK_STATION.z - MARK.d / 2], scale: [MARK.w, 0.004, MARK.t] },
  { position: [WORK_STATION.x, MARK.y, WORK_STATION.z + MARK.d / 2], scale: [MARK.w, 0.004, MARK.t] },
  { position: [WORK_STATION.x - MARK.w / 2, MARK.y, WORK_STATION.z], scale: [MARK.t, 0.004, MARK.d] },
  { position: [WORK_STATION.x + MARK.w / 2, MARK.y, WORK_STATION.z], scale: [MARK.t, 0.004, MARK.d] },
];

/* ── 벽 · 문 ── */

const OPENING = openingFor(DOOR);
/** 먼 끝벽은 뚫지 않는다 — 그쪽은 문이 아니라 **불**이다 */
const END_WALL_GEO = makeEndWallGeometry(M);
const NEAR_WALL_GEO = makeEndWallGeometry(M, undefined, OPENING);
const RIB_GEO = makeRibGeometry(M, RIB);

const CONSOLE_BAYS = [BAYS[2], BAYS[6]] as const;
const UPPER = upperTubes(M, BAYS);
/** 나가는 문이 선 벽 한 칸(왼쪽 · 마지막 bay)은 장식을 비운다 — 세로 튜브·화면·패널이 문틀을 뚫는다 */
const isExitWall = (it: { position: readonly [number, number, number] }) => it.position[0] < 0 && Math.abs(it.position[2] - BAYS[0]) < 2.2;
const notExitWall = <T extends { position: readonly [number, number, number] }>(items: readonly T[]): T[] => items.filter((it) => !isExitWall(it));
const WALL_ALL = wallTubes(M, BAYS);
const WALL: TubeSet = { bezels: notExitWall(WALL_ALL.bezels), tubes: notExitWall(WALL_ALL.tubes) };
const SCREENS = notExitWall(dataScreens(M, BAYS));
const PANELS = notExitWall(panelFaces(M, BAYS));
const STRIPS = ribStrips(M, RIB_ZS, RIB);
const CONSOLES = sideConsoles(M, CONSOLE_BAYS);

/* 옆벽 문 — 중앙 시설의 문 ③④ 와 같은 방식: 키트 Shell 은 옆벽을 평면 하나로 그려 구멍을 못 뚫으므로 벽 앞에 빛을 안 받는 검은 면을 대고 그 앞에 링과 문짝을 세운다 */
const SIDE_OPENING = openingFor(SIDE_DOOR);
const SIDE_HOLE_MAT = new THREE.MeshBasicMaterial({ color: '#05070b', toneMapped: false });
const SIDE_STRIP_MAT = new THREE.MeshBasicMaterial({ color: hdr('#4d8fd6', 0.35), toneMapped: false });
const SIDE_RING_FIT: Fit = { x: SIDE_RING.thickness, y: RING_MODEL.h * SIDE_RING.scale, z: RING_MODEL.w * SIDE_RING.scale };
const SIDE_RING_ITEMS: InstanceItem[] = [{ position: [-(M.wallX - SIDE_RING.thickness / 2), -SIDE_RING.sink, WORK_EXIT.z], rotationY: 0 }];
const SIDE_DOOR_FIT: Fit = { x: SIDE_DOOR.depth, y: SIDE_DOOR.h, z: SIDE_DOOR.w };
const SIDE_DOOR_ITEMS: InstanceItem[] = [{ position: [-(M.wallX - SIDE_DOOR.depth / 2 - GAP), 0, WORK_EXIT.z], rotationY: 0 }];

const RING_FIT: Fit = { x: RING.thickness, y: RING_MODEL.h * RING.scale, z: RING_MODEL.w * RING.scale };
const RING_ITEMS: InstanceItem[] = [{ position: [0, -RING.sink, WORK.profile.nearZ - RING.thickness / 2], rotationY: Math.PI / 2 }];
const DOOR_FIT: Fit = { x: DOOR.depth, y: DOOR.h, z: DOOR.w };
const DOOR_ITEMS: InstanceItem[] = [{ position: [0, 0, WORK.profile.nearZ - DOOR.depth / 2 - GAP], rotationY: Math.PI / 2 }];

/* ─────────────────────────────── 흐르는 것 ─────────────────────────────── */

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const SLAT_COUNT = Math.floor((BELT_Z1 - BELT_Z0) / SLAT_PITCH);
/** 되감기 구간 — 덮개 안. 여기서 사라진 것이 반대쪽 덮개 안에서 다시 나온다 */
const LOOP_Z0 = BELT_Z0 + 0.5;
const LOOP_Z1 = BELT_Z1 - 0.5;
const LOOP_LEN = LOOP_Z1 - LOOP_Z0;

/**
 * 벨트 위의 살과 화물 — 프레임마다 −z(소각로 쪽)로 BELT_SPEED 만큼 밀고, 끝에 닿으면 머리로 되감는다.
 * 행렬을 직접 쓰는 것은 InstancedMesh 하나로 드로우콜 하나를 유지하려고. 이 방에서 이것 말고는 아무것도 프레임마다 안 움직인다.
 * 멈추는 조건이 **없다** — 플레이어가 막든, 개체가 들어가든, 집행자가 서든 벨트는 돈다. 그게 이 방의 문장이다.
 */
function BeltFlow() {
  const slats = useRef<THREE.InstancedMesh>(null);
  const loads = useRef<THREE.InstancedMesh>(null);
  const t = useRef(0);
  const x = BELTS[0].x;

  useFrame((_, delta) => {
    t.current = (t.current + Math.min(delta, 0.1) * BELT_SPEED) % LOOP_LEN;
    const shift = t.current;
    const s = slats.current;
    if (s) {
      _q.identity();
      _s.set(BELT.w - 0.1, 0.02, 0.06);
      for (let i = 0; i < SLAT_COUNT; i += 1) {
        // 머리(z1)에서 출발해 소각로(z0)로 — 살은 간격이 같으니 위상만 흐른다
        const z = LOOP_Z1 - ((i * SLAT_PITCH + shift) % LOOP_LEN);
        _p.set(x, BELT.h + 0.01, z);
        s.setMatrixAt(i, _m.compose(_p, _q, _s));
      }
      s.instanceMatrix.needsUpdate = true;
    }
    const l = loads.current;
    if (l) {
      _q.identity();
      LOADS.forEach((ld, i) => {
        const z = LOOP_Z1 - ((ld.at + shift) % LOOP_LEN);
        _p.set(x, BELT.h + ld.h / 2, z);
        _s.set(ld.w, ld.h, ld.d);
        l.setMatrixAt(i, _m.compose(_p, _q, _s));
      });
      l.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group name="흐르는 것">
      <instancedMesh ref={slats} args={[UNIT_BOX, SLAT_MAT, SLAT_COUNT]} name="벨트 살" frustumCulled={false} />
      <instancedMesh ref={loads} args={[UNIT_BOX, CRATE_MAT, LOADS.length]} name="벨트 화물" frustumCulled={false} />
    </group>
  );
}

/* ─────────────────────────────── 건물 ─────────────────────────────── */

export function Work(_props: { quality?: QualityTier }) {
  const tex = useSciTextures();
  const screenMats = useScreenMaterials(tex.console);
  const ringMat = useShapedMaterial('sci_bulkhead');
  const consoleMat = useShapedMaterial('sci_console');
  const doorMat = useShapedMaterial('sci_blast_door');

  return (
    <group name="작업 구역">
      <Shell m={M} tex={tex} endWall={END_WALL_GEO} nearWall={NEAR_WALL_GEO} />
      <RibRun geometry={RIB_GEO} zs={RIB_ZS} />
      <WallKit
        upper={UPPER}
        wall={WALL}
        screens={SCREENS}
        panels={PANELS}
        strips={STRIPS}
        consoles={CONSOLES}
        consoleMaterial={consoleMat}
        screenMaterials={screenMats}
      />

      {/* 소각로 — 뽑아 세운 화구와 그 입을 막는 붉은 판. 안은 여전히 안 보여 준다 (한때 코드 상자 셋이었다 — 검은 목구멍·프레임) */}
      <group name="소각로" position={[0, 0, FIRE.z]}>
        <Parts id="incinerator" fit={INCIN_FIT} items={INCIN_ITEMS} />
        {/* 입을 막는 붉은 원판 — 화구의 입은 원형이다 (안지름 ≈1.6 · 중심 y ≈1.45, 2026-09-03 스크린샷 실측).
            한때 2.7 × 2.3 사각 판이었는데 그건 얼굴 전체를 덮었다. 입 안의 거친 UV 도 이 판이 가린다 */}
        <mesh position={[0, 1.45, INCIN.d + 0.02]} material={FIRE_MAT}>
          <circleGeometry args={[0.95, 40]} />
        </mesh>
      </group>

      <group name="컨베이어">
        <Instanced name="벨트" items={BELT_ITEMS} material={BELT_MAT} />
        <Instanced name="벨트 띠" items={BELT_STRIPS} material={BELT_STRIP_MAT} receiveShadow={false} />
        <Instanced name="덮개" items={HOOD_ITEMS} material={HOOD_MAT} />
        <BeltFlow />
      </group>

      <Instanced name="내 자리" items={STATION_MARK} material={MARK_MAT} receiveShadow={false} />

      <group name="화물">
        <Instanced name="상자" items={CRATE_ITEMS} material={CRATE_MAT} />
        <Instanced name="상자 표시등" items={CRATE_DOTS} material={CRATE_DOT_MAT} receiveShadow={false} />
      </group>

      <Doorway z={WORK.profile.nearZ} dir={1} opening={OPENING} />
      <Parts id="sci_bulkhead" fit={RING_FIT} items={RING_ITEMS} material={ringMat} />
      <Parts id="sci_blast_door" fit={DOOR_FIT} items={DOOR_ITEMS} material={doorMat} />

      {/* 나가는 문 — 왼쪽 옆벽, 소각로 곁. 두 주기가 끝나면(furnace leftWork) 다가설 때 열린다 */}
      <group name="나가는 문">
        <mesh position={[-(M.wallX - 0.03), SIDE_OPENING.h / 2, WORK_EXIT.z]} rotation-y={sideRot(-1)} material={SIDE_HOLE_MAT}>
          <planeGeometry args={[SIDE_OPENING.w, SIDE_OPENING.h]} />
        </mesh>
        <mesh position={[-(M.wallX - 0.08), 0.055, WORK_EXIT.z]} material={SIDE_STRIP_MAT}>
          <boxGeometry args={[0.04, 0.07, SIDE_OPENING.w * 0.8]} />
        </mesh>
        <Parts id="sci_bulkhead" fit={SIDE_RING_FIT} items={SIDE_RING_ITEMS} material={ringMat} />
        <SlidingLeaf name="나가는 문짝" open={exitDoor.isOpen} h={SIDE_DOOR.h} fit={SIDE_DOOR_FIT} items={SIDE_DOOR_ITEMS} material={doorMat} />
      </group>
    </group>
  );
}

/* ─────────────────────────────── 조명 ─────────────────────────────── */

/**
 * bay 광원 여덟 + 불 앞의 주황 광원 둘. 방 안쪽으로 갈수록 색이 식은 청색에서 주황으로 넘어간다.
 * **라인 위만** 비춘다 (레벨 설계: 「조명 라인 위만」) — 10 m 폭이라도 그것만으로 바닥까지 닿는다.
 * 폭 8 → 10 (2026-09-03) 에 맞춰 bay 등 15/13 → **20/15**, 반구광 1.5 → 1.8 — 등의 자리는 그대로 라인 위다. 벽 쪽이 어두운 것이 규칙이라 열을 안 늘린다.
 * 불 앞의 주황 둘도 22/14 → 26/15 · 9/12 → 12/13 — 청색만 올리면 안쪽의 따뜻함이 상대적으로 죽는다.
 * 헤드리스 평균(tools/scenario2-shots.mjs): 25/41/66 → 31/49/77.
 */
export function WorkLights(_props: { flicker: boolean }) {
  return (
    <>
      <hemisphereLight args={['#a4b6cf', '#2a313c', 1.8]} />
      {BAYS.map((z) => (
        <pointLight key={z} position={[0, WORK.profile.ceilingY - 1.6, z]} intensity={20} distance={15} decay={1.7} color="#9cc3ff" />
      ))}
      <pointLight position={[0, FIRE.h * 0.6, FIRE.z + 2.2]} intensity={26} distance={15} decay={1.8} color="#ff8a3c" />
      <pointLight position={[0, 2.2, FIRE.z + 6]} intensity={12} distance={13} decay={1.9} color="#ff7a30" />
    </>
  );
}

/* ─────────────────────────────── 충돌 ─────────────────────────────── */

const COLLIDERS = [
  ...WORK.colliders,
  ...consoleColliders(WORK.profile.wallX, CONSOLE_BAYS),
  ...BELTS.map((b) => boxCollider(b.x, (b.z0 + b.z1) / 2, BELT.w, b.z1 - b.z0, BELT.h)),
  ...HOOD_ZS.map((z) => boxCollider(BELTS[0].x, z, HOOD.w, HOOD.d, HOOD.h)),
  ...CRATES.map((c) => boxCollider(c.x, c.z, c.w, c.d, c.h)),
  // 소각로 목구멍 — 플레이어는 들어갈 수 없다. 막는 것과 따라 들어가는 것은 다른 이야기다
  boxCollider(0, FIRE.z + 1.7, FIRE.w, 3.4, FIRE.h),
  // 화구 몸체 — 목구멍 상자(x ±1.5)보다 넓어서(±1.9) 옆에서 모서리로 파고드는 것을 막는다
  boxCollider(0, FIRE.z + INCIN.d / 2, INCIN.w + 0.1, INCIN.d, FIRE.h),
];

export function resolveWorkColliders(p: THREE.Vector3, feetY: number) {
  const out = resolveCollisions(p.x, p.z, feetY, undefined, COLLIDERS);
  p.x = out.x;
  p.z = out.z;
}

export function workGroundHeightAt(x: number, z: number, fromY: number): number {
  return groundHeightWith(x, z, fromY, COLLIDERS);
}
