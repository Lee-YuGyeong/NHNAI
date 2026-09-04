/**
 * 중앙 시설 — 시나리오 2 의 셋째 방. **코어까지의 거리가 곧 노출량인 방.**
 *
 * 레벨 설계 「누가 듣고 있나」 챕터 3: 지름 26 m 원형 홀, 한가운데 코어, 동심원 셋(코어권 6 · 홀 10 · 벽 그늘), 출입구 넷.
 * 본판 중앙 시설(world/map/central.tsx)과 같은 8각 강판 셸을 같은 키트로 세우고 같은 코어 탑(central/CoreTower)을 놓는다 —
 * 시나리오 2 의 방이 본판의 그 방과 다른 시설로 보이면 「같은 구역」이 거짓이 된다. 다만 **등록부는 따로다**(MAPS2).
 *
 * 원형이 아니라 8각 상자(26 × 26)다 — 키트 Shell 은 z 축 직선 상자만 세운다(기록 복도의 호가 그래서 따로 조각을 이었다).
 * 동심원은 벽이 아니라 **데이터**(features/world2/corefield.ts)라서 상자여도 규칙은 그대로다. 대신 바닥에 r 6 · r 10 선을 옅게 그어
 * 플레이어가 세 구역을 눈으로 읽게 한다 — 규칙이 보이지 않으면 「발로 정한다」가 성립하지 않는다.
 *
 * 국면(밝음 → 락다운 → 어둠)은 features/world2/central2.ts 가 쥔다. 이 파일은 그 저장소를 **읽기만** 한다:
 *   문짝 넷은 doors 를 보고 오르내리고(Central2Doors), 닫힌 문짝은 충돌이 되며(resolveCentral2Colliders),
 *   조명은 light(now) 배율로 매 프레임 줄어든다(Central2Lights — 어둠 국면 40 %, 콘솔 15 초 40 %).
 *
 * 코어 중심은 corefield.CORE_CENTER 그대로다 — 방이 코어를 다른 데 세우면 zone() 이 엉뚱한 자리를 잰다.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

import { CORE_CENTER, FIELD } from '@/features/world2/corefield';
import { central2, type DoorId } from '@/features/world2/central2';
import { CoreTower, CoreTowerLights } from '@/world/map/central/CoreTower';
import { DAIS, TOWER } from '@/world/map/central/layout';
import type { MapDef } from '@/world/map';
import type { Fit, InstanceItem } from '@/world/map/corridor/part';
import { Parts } from '@/world/map/parts';
import {
  CONSOLE,
  Doorway,
  RibRun,
  SIDES,
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
} from '@/world/map/scifi';
import { groundHeightAt as groundHeightWith, resolveCollisions, type Collider } from '@/world/mp/collide';
import type { QualityTier } from '@/world/perf/quality';

import { SlidingLeaf } from './leaf';
import { DOOR, GAP, RIB, RING, RING_MODEL, boxCollider, consoleColliders, makeRoom, onSide } from './room';

/* ─────────────────────────────── 방 ─────────────────────────────── */

/**
 * **26 × 26 m · 천장 10** — 설계의 「지름 26 m」를 상자 한 변으로 옮겼다. 본판 중앙 시설(28 × 26)과 같은 벽 높이(6)·천장(10)이라
 * 코어 탑이 층 넷 그대로 선다(CoreTower 는 천장에서 층 수를 역산한다 — 낮으면 층이 준다).
 * z 는 −22 ~ 4 로 본판 WORLD 클램프(−23 ~ 15) 안이라 bounds 가 필요 없다. 먼 끝(−22)이 문 ② — scenario2 의 exitZ −20.4 가 그 앞이다.
 */
export const CENTRAL2 = makeRoom({ wallX: 13, farZ: -22, nearZ: 4, wallTopY: 6, ceilingY: 10, bay: 4 });
const { m: M, bays: BAYS } = CENTRAL2;
const { wallX: WALL_X, farZ: FAR_Z, nearZ: NEAR_Z, ceilingY: CEILING_Y } = CENTRAL2.profile;

/** 코어 중심 — corefield 의 약속값 **그 객체**다. 여기서 다른 값을 적으면 zone() 과 방이 갈라진다 (시험이 동일성을 쥔다) */
export const CENTRAL2_CORE = CORE_CENTER;

/** 들어오면 코어를 본다 — 본판 중앙 시설과 같은 시선 (탑 몸통 가운데 높이) */
export const CENTRAL2_FOCUS = { x: CENTRAL2_CORE.x, y: 3, z: CENTRAL2_CORE.z } as const;

/**
 * 들어와 서는 자리 — 문 ① 안쪽 4.8 m. 다른 방들처럼 nearZ − 2.4(z 1.6)로 두면 코어에서 12.1 m 라 **벽 그늘**에서 시작한다 —
 * 첫 발이 「어둡고 아무도 안 보는 자리」면 「밝다. 여기가 제일 밝다」(대본 ARRIVE)가 거짓이 된다. z −0.8 은 코어에서 9.7 m, 홀이다.
 */
export const CENTRAL2_SPAWN = { x: 0, z: -0.8 } as const;

/* ── 자리 — 이 방이 정하는 자리들 (features/world2 의 PLACES · 디렉터 슬롯이 읽는다) ── */

/**
 * 재회 슬롯 둘 — 문 ① 정면 좌우, 홀(레벨 설계 07: 「진입하며 판독 거리에 들어오는 자리」). 코어에서 9.0 m.
 * 복도·휴게에서 원장이 생긴 개체가 여기 **먼저 와 있다**. 없으면 배경 개체가 선다.
 */
export const REUNION_SLOTS = [
  { x: -3.5, z: -2.2 },
  { x: 3.5, z: -2.2 },
] as const;

/**
 * 씨앗 슬롯 둘 — 코어권(6 m) 안이되 코어 우회 원(layout.CORE_KEEPOUT 5.9) 밖. 문 ① 에서 본 코어의 좌우 ±35°.
 * 반지름 5.95 는 그 사이 폭 0.1 의 한가운데다 — 코어권이 6 m 이고 받침 충돌의 외접원 + 몸 반지름이 5.9 라 자리가 이만큼뿐이다.
 * 「내 어긋남을 본 개체를 코어권에」(슬롯 표) — 여기 선 개체 앞에서 건 말은 전파 ×3 이다.
 */
const SEED_R = 5.95;
const SEED_ANGLE = (35 * Math.PI) / 180;
export const SEED_SLOTS = [
  { x: round(CENTRAL2_CORE.x - Math.sin(SEED_ANGLE) * SEED_R), z: round(CENTRAL2_CORE.z + Math.cos(SEED_ANGLE) * SEED_R) },
  { x: round(CENTRAL2_CORE.x + Math.sin(SEED_ANGLE) * SEED_R), z: round(CENTRAL2_CORE.z + Math.cos(SEED_ANGLE) * SEED_R) },
] as const;

/**
 * 검문 둘(A-044 · A-128)의 자리 — 스폰 3.6 m 앞 좌우, 문 ① 진입로 양옆. 들어서자마자 말 반경(2.6) 밖이되 시야 안이다.
 * 재회 슬롯과 3.7 m, 서로 6 m — 배경 개체 간격 규칙(patrol.BG_GAP 3.2)을 지킨다.
 */
export const CHECK_SPOTS = [
  { x: -3.0, z: 1.2 },
  { x: 3.0, z: 1.2 },
] as const;

/* ── 국면이 바꾸는 방의 색 ── */

/**
 * **락다운이 방의 색을 바꾼다** — 코어에 다가가 출입구 넷이 닫히는 그 순간 (central2.phase).
 *
 * 본판은 이 자리에서 곡만 갈아 끼웠다(MapDef.lockdownBgm). 그런데 시나리오 2 의 중앙 시설은 「제일 밝은 방」이라
 * 소리만 바뀌면 **화면은 아무 일도 없다** (2026-09-03 사용자: 「이벤트가 발생하면 브금이 바뀌고 맵색이 변경되는
 * 그런 임팩트가 있어야 하는데 없어」). 그래서 곡과 함께 배경 · 안개 · 앰비언트를 같이 옮긴다.
 *
 * 방향은 하나다 — **차가운 청회색에서 붉고 좁은 쪽으로.** 앰비언트를 절반 아래로 내려 코어만 남기고(코어 빛은
 * central2.light 가 따로 든다), 안개를 두 배 가까이 올려 26 m 홀의 반대편 벽을 지운다: 문이 닫혔다는 것이
 * 「넓은 방이 갑자기 안 보인다」로 읽힌다. 어둠 국면(콘솔이 내린 뒤)은 거기서 한 단계 더 간다.
 *
 * MapDef 를 통째로 갈지 않고 **덮어쓸 칸만** 둔다 — 방의 구조(Scene · 충돌 · 초점)는 국면과 무관하다.
 */
export type Central2Tone = Pick<MapDef, 'background' | 'fog' | 'ambient'>;

/** 락다운 — 문 넷이 닫혔다. 붉게, 어둡게, 좁게 */
export const CENTRAL2_LOCKDOWN_TONE: Central2Tone = {
  background: '#0a0204',
  fog: ['#1a0709', 0.015],
  ambient: { color: '#c2818c', intensity: 0.5 },
};

/**
 * 차가움 — 락다운 중 움직인 개체가 처리된 뒤. 붉은 경보가 식은 강철색으로 내려앉는다: 소란이 아니라 **정리**의 색이다
 * (2026-09-03 사용자: 「쏴 죽이고 냉정한 분위기로」). 어둠 국면이 오면 어둠이 이긴다
 */
export const CENTRAL2_COLD_TONE: Central2Tone = {
  background: '#04060a',
  fog: ['#0a0f17', 0.02],
  ambient: { color: '#8da3bf', intensity: 0.35 },
};

/** 어둠 — 콘솔이 조명을 내렸다. 여기서는 코어와 손전등 말고 아무것도 안 보여야 한다 */
export const CENTRAL2_DARK_TONE: Central2Tone = {
  background: '#050103',
  fog: ['#0d0305', 0.024],
  ambient: { color: '#8f6470', intensity: 0.22 },
};

/* ── 문 넷 ── */

/**
 * 옆벽 문(③ ④)은 코어와 같은 z 에 선다. 그 자리의 리브와 벽 장식은 뺀다 — 링(폭 5.36)과 겹친다.
 * 격벽 링 반폭 2.68 에 여유 0.4. 리브는 두께 0.7 이라 이 밖이면 링에 안 닿는다.
 */
const SIDE_DOOR_CLEAR = (RING_MODEL.w * RING.scale) / 2 + 0.4;
const nearSideDoor = (z: number) => Math.abs(z - CENTRAL2_CORE.z) <= SIDE_DOOR_CLEAR;
const DROPPED_RIBS = CENTRAL2.ribs.filter(nearSideDoor);
const RIB_ZS = CENTRAL2.ribs.filter((z) => !nearSideDoor(z));
/** 벽 장식이 걸리는 bay — 옆벽 문의 두 bay 는 비운다 */
const DECOR_BAYS = BAYS.filter((z) => !nearSideDoor(z));

/**
 * 문짝 중심 넷 — ① 들어온 문(가까운 끝) · ② 작업 구역으로(먼 끝) · ③ ④ 옆벽(락다운에 닫히고 다시 안 열린다).
 * 문짝은 링 두께 안에 선다 (끝벽 안쪽 면에서 depth/2 + GAP) — 본판·다른 방과 같은 자리다.
 */
export const CENTRAL2_DOORS: Record<DoorId, { x: number; z: number }> = {
  d1: { x: 0, z: round(NEAR_Z - DOOR.depth / 2 - GAP) },
  d2: { x: 0, z: round(FAR_Z + DOOR.depth / 2 + GAP) },
  d3: { x: round(-(WALL_X - DOOR.depth / 2 - GAP)), z: CENTRAL2_CORE.z },
  d4: { x: round(WALL_X - DOOR.depth / 2 - GAP), z: CENTRAL2_CORE.z },
};
const DOOR_IDS: readonly DoorId[] = ['d1', 'd2', 'd3', 'd4'];

/** 나가는 문 = ② */
export const CENTRAL2_EXIT = CENTRAL2_DOORS.d2;
const EXIT_REACH = 1.6;

/** 문 ② 앞인가 — 문짝 중심에서 1.6 m 안. 닫힌 문짝 앞(0.53 m)에서도 참이다 — 나갈 수 있는지는 scenario2.canLeave 가 따로 본다 */
export function central2AtExit(x: number, z: number): boolean {
  return Math.hypot(x - CENTRAL2_EXIT.x, z - CENTRAL2_EXIT.z) <= EXIT_REACH && z < CENTRAL2_EXIT.z + 2;
}

/* ── 코어 출력 콘솔 ── */

/**
 * 콘솔은 **서남쪽 벽**(−x · 문 ① 쪽 절반) — 문 ③ 을 지나 첫 bay. 코어에서 13.4 m, 벽 그늘이다.
 * 그늘에 두는 이유: 콘솔을 쓰는 것은 「소리를 지르는 것과 같다」(설계 04)인데, 그늘은 조용히 말 걸 유일한 자리다 —
 * 조용한 자리에서만 할 수 있는 시끄러운 일. 코어권에 두면 이미 다 읽히는 자리라 콘솔의 값이 없다.
 */
const CONSOLE_Z = DECOR_BAYS.filter((z) => z > CENTRAL2_CORE.z)[0];
/**
 * facing 은 Unit·patrol 과 같은 heading 규약 — θ 가 보는 방향은 (sin θ, cos θ), −π/2 면 −x(벽). 카메라 yaw 는 부호가 반대라
 * (WorldScene: yaw = atan2(−dx, −dz)) 방향으로 비교하는 쪽이 안전하다 — look 이 그 벡터다.
 */
export const CENTRAL2_CONSOLE = {
  x: round(-(WALL_X - CONSOLE.d / 2)),
  z: CONSOLE_Z,
  facing: -Math.PI / 2,
  look: { dx: -1, dz: 0 },
} as const;

/* ─────────────────────────────── 지오메트리 · 배치 (모듈 수준 상수) ─────────────────────────────── */

const OPENING = openingFor(DOOR);
const END_WALL_GEO = makeEndWallGeometry(M, 6.4, OPENING);
const RIB_GEO = makeRibGeometry(M, RIB);
/** 상부 튜브는 경사면(y 6 위)이라 옆벽 문과 안 겹친다 — 전 bay */
const UPPER = upperTubes(M, BAYS);
const WALL = wallTubes(M, DECOR_BAYS);
const DATA = dataScreens(M, DECOR_BAYS);
const PANELS = panelFaces(M, DECOR_BAYS);
const STRIPS = ribStrips(M, RIB_ZS, RIB);
/** 키트 콘솔은 늘 양쪽에 달리는데 이 방의 콘솔은 하나다 — −x 것만 남긴다 */
const CONSOLES_BOTH = sideConsoles(M, [CONSOLE_Z]);
const CONSOLES = { parts: onSide(CONSOLES_BOTH.parts, -1), tubes: onSide(CONSOLES_BOTH.tubes, -1), dots: onSide(CONSOLES_BOTH.dots, -1) };

const RING_FIT: Fit = { x: RING.thickness, y: RING_MODEL.h * RING.scale, z: RING_MODEL.w * RING.scale };
/** 링 넷 — 끝벽 둘은 두께를 z 로(rotY π/2), 옆벽 둘은 x 로(rotY 0) */
const RING_ITEMS: InstanceItem[] = [
  { position: [0, -RING.sink, FAR_Z + RING.thickness / 2], rotationY: Math.PI / 2 },
  { position: [0, -RING.sink, NEAR_Z - RING.thickness / 2], rotationY: Math.PI / 2 },
  { position: [-(WALL_X - RING.thickness / 2), -RING.sink, CENTRAL2_CORE.z], rotationY: 0 },
  { position: [WALL_X - RING.thickness / 2, -RING.sink, CENTRAL2_CORE.z], rotationY: 0 },
];
const DOOR_FIT: Fit = { x: DOOR.depth, y: DOOR.h, z: DOOR.w };
const LEAF_ITEMS: Record<DoorId, InstanceItem[]> = {
  d1: [{ position: [CENTRAL2_DOORS.d1.x, 0, CENTRAL2_DOORS.d1.z], rotationY: Math.PI / 2 }],
  d2: [{ position: [CENTRAL2_DOORS.d2.x, 0, CENTRAL2_DOORS.d2.z], rotationY: -Math.PI / 2 }],
  d3: [{ position: [CENTRAL2_DOORS.d3.x, 0, CENTRAL2_DOORS.d3.z], rotationY: 0 }],
  d4: [{ position: [CENTRAL2_DOORS.d4.x, 0, CENTRAL2_DOORS.d4.z], rotationY: Math.PI }],
};

/**
 * 옆벽 문 뒤의 어두운 면 — 키트 Shell 은 옆벽을 평면 하나로 그려 구멍을 못 뚫는다(끝벽만 makeEndWallGeometry 로 뚫린다).
 * 그래서 벽 바로 앞에 빛을 안 받는 검은 면을 대고 그 앞에 문짝을 세운다: 문짝이 올라가 있으면 강판이 아니라 **불 꺼진 통로**가 보인다.
 * 바닥의 옅은 띠는 끝벽 문간(scifi.Doorway)과 같은 것 — 완전한 검정은 구멍이 아니라 렌더 오류처럼 보인다.
 */
const SIDE_HOLE_MAT = new THREE.MeshBasicMaterial({ color: '#05070b', toneMapped: false });
const SIDE_STRIP_MAT = new THREE.MeshBasicMaterial({ color: hdr('#4d8fd6', 0.35), toneMapped: false });

/**
 * 바닥의 동심원 — r 6 · r 10, 폭 6 cm 의 옅은 선. 규칙은 corefield 의 데이터고 이 선은 그 규칙의 **그림**이다.
 * 리브 띠(0.7)의 절반 밝기 — 눈에 띄되 빛을 내지는 않게. 발광 배율 1 초과·블룸 없음(키트 규칙).
 */
const ZONE_RING_MAT = new THREE.MeshBasicMaterial({ color: hdr('#4d8fd6', 0.35), toneMapped: false });
const ZONE_RING_W = 0.06;
const ZONE_RADII = [FIELD.core.r, FIELD.hall.r] as const;

/* ─────────────────────────────── 건물 ─────────────────────────────── */

export function Central2(_props: { quality?: QualityTier }) {
  const tex = useSciTextures();
  const screenMats = useScreenMaterials(tex.console);
  const consoleMat = useShapedMaterial('sci_console');
  const ringMat = useShapedMaterial('sci_bulkhead');
  const doorMat = useShapedMaterial('sci_blast_door');

  return (
    <group name="중앙 시설 (시나리오 2)">
      <Shell m={M} tex={tex} endWall={END_WALL_GEO} />
      <RibRun geometry={RIB_GEO} zs={RIB_ZS} />
      <WallKit upper={UPPER} wall={WALL} screens={DATA} panels={PANELS} strips={STRIPS} consoles={CONSOLES} consoleMaterial={consoleMat} screenMaterials={screenMats} />

      <CoreTower center={CENTRAL2_CORE} ceilingY={CEILING_Y} />
      <ZoneRings />

      <Doorway z={FAR_Z} dir={-1} opening={OPENING} />
      <Doorway z={NEAR_Z} dir={1} opening={OPENING} />
      {SIDES.map((s) => (
        <SideDoorway key={s} side={s} />
      ))}
      <Parts id="sci_bulkhead" fit={RING_FIT} items={RING_ITEMS} material={ringMat} />
      <Central2Doors material={doorMat} />
    </group>
  );
}

function ZoneRings() {
  return (
    <group name="동심원">
      {ZONE_RADII.map((r) => (
        <mesh key={r} position={[CENTRAL2_CORE.x, 0.012, CENTRAL2_CORE.z]} rotation-x={-Math.PI / 2} material={ZONE_RING_MAT}>
          <ringGeometry args={[r - ZONE_RING_W / 2, r + ZONE_RING_W / 2, 160]} />
        </mesh>
      ))}
    </group>
  );
}

function SideDoorway({ side }: { side: -1 | 1 }) {
  return (
    <group name="옆벽 문간">
      <mesh position={[side * (WALL_X - 0.03), OPENING.h / 2, CENTRAL2_CORE.z]} rotation-y={sideRot(side)} material={SIDE_HOLE_MAT}>
        <planeGeometry args={[OPENING.w, OPENING.h]} />
      </mesh>
      <mesh position={[side * (WALL_X - 0.08), 0.055, CENTRAL2_CORE.z]} material={SIDE_STRIP_MAT}>
        <boxGeometry args={[0.04, 0.07, OPENING.w * 0.8]} />
      </mesh>
    </group>
  );
}

/**
 * 문짝 넷 — 저장소의 doors 를 매 프레임 읽고 열린 문은 천장으로, 닫힌 문은 바닥으로 민다 (문짝 자체는 world2/map/leaf.tsx).
 * 밝음 국면은 넷 다 열려 있는데 첫 프레임에 바로 목표 자리에 놓이므로 들어서며 문이 열리는 연출은 없다.
 */
function Central2Doors({ material }: { material: THREE.Material }) {
  return (
    <>
      {DOOR_IDS.map((id) => (
        <SlidingLeaf key={id} name={`문짝 ${id}`} open={() => central2.get().doors[id]} h={DOOR.h} fit={DOOR_FIT} items={LEAF_ITEMS[id]} material={material} />
      ))}
    </>
  );
}

/* ─────────────────────────────── 조명 ─────────────────────────────── */

/**
 * **게임에서 제일 밝은 방**(대본 ARRIVE: 「밝다. 여기가 제일 밝다」) — 그리고 밝기가 가운데에 몰린 방.
 * 코어 위아래(CoreTowerLights)가 홀을 들고, 홀 광원 넷이 r 6~10 을 받치고, 벽 광원은 낮고 따뜻하고 약하다 —
 * 벽 그늘(r > 10)이 홀보다 **실제로 어두워야** 「내 몸이 안 읽힌다」가 보이는 사실이 된다.
 * 본판 중앙 시설(bay 광원 34 × 6 + 코어 40/24)과 달리 벽을 따라 센 광원을 안 둔다 — 거기선 벽도 밝았다.
 */
const CORE_LIGHT2 = { intensity: 84, distance: 26 } as const;
const HALL_LIGHT = { y: 6.5, r: 7, intensity: 34, distance: 16 } as const;
const HALL_LIGHTS: readonly { x: number; z: number }[] = [
  { x: -HALL_LIGHT.r, z: CENTRAL2_CORE.z + HALL_LIGHT.r },
  { x: HALL_LIGHT.r, z: CENTRAL2_CORE.z + HALL_LIGHT.r },
  { x: -HALL_LIGHT.r, z: CENTRAL2_CORE.z - HALL_LIGHT.r },
  { x: HALL_LIGHT.r, z: CENTRAL2_CORE.z - HALL_LIGHT.r },
];
/** 벽 광원은 한 bay 걸러 — 광원 수가 곧 셰이더 비용이다 (본판 중앙 9 · 이 방 13) */
const WALL_LIGHT_ZS = DECOR_BAYS.filter((_, i) => i % 2 === 0);
const WALL_LIGHT = { y: 2.6, inset: 0.9, intensity: 4, distance: 6 } as const;

/**
 * 조명 배율 — central2.light(now): 밝음·락다운 1, 어둠 국면 0.4, 콘솔 15 초 0.4.
 * React 상태가 아니라 ref + useFrame 이다 — 매 프레임 리렌더는 안 한다. 배율이 바뀐 프레임에만 광원을 훑어 base × k 로 맞춘다.
 * base 는 첫 훑기 때 JSX 의 값을 userData 에 적어 둔다 — CoreTowerLights 처럼 ref 를 안 내주는 광원도 같이 잡힌다.
 */
/**
 * 락다운의 방 조명 — **붉게, 어둡게.** 문 넷이 닫히는 순간 이 방의 등이 전부 경보등으로 갈린다.
 * 배경 · 안개 · 앰비언트(CENTRAL2_LOCKDOWN_TONE)만 옮기면 화면이 거의 안 변한다: 26 m 홀을 실제로 칠하는 것은
 * 벽등 · 홀등 · 코어탑등이라, 그 색을 안 건드리면 「문이 닫혔다」가 눈에 안 든다 (2026-09-03 사용자).
 * 어둠 국면은 이미 light() 가 세기를 40 % 로 내리니 여기서는 색만 조금 얹는다.
 */
const ALARM_COLOR = new THREE.Color('#ff3a2e');
/** 처리 뒤의 차가움 — 경보의 붉은색 대신 식은 강철색. 더 어둡게(0.45) 더 짙게(0.55) */
const COLD_COLOR = new THREE.Color('#8fb3d9');
const COLD_DIM = 0.45;
const COLD_MIX = 0.55;
/** 락다운 — 세기 배율과 붉게 섞는 양 */
const ALARM_DIM = 0.55;
const ALARM_MIX = 0.6;
/** 어둠 — 세기는 light() 가 이미 내렸다. 색만 */
const DARK_MIX = 0.35;

export function Central2Lights(_props: { flicker: boolean }) {
  const group = useRef<THREE.Group>(null);
  const last = useRef('');
  useFrame(() => {
    const c2 = central2.get();
    const phase = c2.phase;
    // 락다운 중 하나가 처리됐으면 붉은 경보가 식는다 — 더 어둡고, 강철색으로 (CENTRAL2_COLD_TONE 과 짝)
    const cold = phase === 'lockdown' && c2.terminated !== null;
    const k = central2.light(performance.now()) * (phase === 'lockdown' ? (cold ? COLD_DIM : ALARM_DIM) : 1);
    const mix = phase === 'lockdown' ? (cold ? COLD_MIX : ALARM_MIX) : phase === 'dark' ? DARK_MIX : 0;
    const tint = cold ? COLD_COLOR : ALARM_COLOR;
    const key = `${k}|${mix}|${cold}`;
    if (key === last.current) return;
    last.current = key;
    group.current?.traverse((o) => {
      const l = o as THREE.Light;
      if (!l.isLight) return;
      const base = (l.userData.base ??= l.intensity) as number;
      l.intensity = base * k;
      // 원래 색은 한 번만 적어 둔다 — 섞은 색을 또 섞으면 판이 갈수록 붉어진다
      const from = (l.userData.baseColor ??= l.color.clone()) as THREE.Color;
      l.color.copy(from).lerp(tint, mix);
      // 반구광은 아래쪽 색도 같이 — 바닥이 파란 채로 남으면 위아래가 딴 방이 된다
      const hemi = o as THREE.HemisphereLight;
      if (hemi.isHemisphereLight) {
        const g = (l.userData.baseGround ??= hemi.groundColor.clone()) as THREE.Color;
        hemi.groundColor.copy(g).lerp(tint, mix);
      }
    });
  });
  return (
    <group ref={group} name="중앙 시설 조명">
      <hemisphereLight args={['#a4b6cf', '#2a313c', 1.7]} />
      <CoreTowerLights center={CENTRAL2_CORE} ceilingY={CEILING_Y} light={CORE_LIGHT2} />
      {HALL_LIGHTS.map((p) => (
        <pointLight key={`${p.x}:${p.z}`} position={[p.x, HALL_LIGHT.y, p.z]} intensity={HALL_LIGHT.intensity} distance={HALL_LIGHT.distance} decay={1.7} color="#9cc3ff" />
      ))}
      {WALL_LIGHT_ZS.flatMap((z) =>
        SIDES.map((s) => (
          <pointLight
            key={`${s}:${z}`}
            position={[s * (WALL_X - WALL_LIGHT.inset), WALL_LIGHT.y, z]}
            intensity={WALL_LIGHT.intensity}
            distance={WALL_LIGHT.distance}
            decay={1.8}
            color="#d9b08c"
          />
        )),
      )}
    </group>
  );
}

/* ─────────────────────────────── 충돌 ─────────────────────────────── */

/**
 * 코어 탑의 충돌 — 본판 layout.COLLIDERS 와 같은 셋: 단(정사각 r×0.85 · 45° · top 0.5 라 걸어 오른다) + 받침·콘솔 링 박스 둘(0° · 45°).
 * 값은 CoreTower 의 기본 치수(DAIS · TOWER)에서 읽는다 — 탑과 충돌이 다른 숫자를 보면 보이는 것과 막히는 것이 갈린다.
 */
const CORE_COLLIDERS: readonly Collider[] = [
  { x: CENTRAL2_CORE.x, z: CENTRAL2_CORE.z, hw: DAIS.r * 0.85, hd: DAIS.r * 0.85, rot: Math.PI / 4, top: DAIS.h },
  { x: CENTRAL2_CORE.x, z: CENTRAL2_CORE.z, hw: TOWER.consoleR + 0.5, hd: TOWER.consoleR + 0.5, rot: 0, top: 6 },
  { x: CENTRAL2_CORE.x, z: CENTRAL2_CORE.z, hw: TOWER.consoleR + 0.5, hd: TOWER.consoleR + 0.5, rot: Math.PI / 4, top: 6 },
];
/** 뺀 리브의 충돌도 뺀다 — 안 보이는 리브가 문 ③ ④ 앞을 막으면 유령 벽이다 */
const isDroppedRib = (c: Collider) => c.hw === RIB.d / 2 && DROPPED_RIBS.includes(c.z);
const COLLIDERS: readonly Collider[] = [
  ...CENTRAL2.colliders.filter((c) => !isDroppedRib(c)),
  ...CORE_COLLIDERS,
  ...consoleColliders(WALL_X, [CONSOLE_Z]).filter((c) => c.x < 0),
];

/** 문짝 넷의 충돌 — 끝벽 것은 x 로 넓고 옆벽 것은 z 로 넓다 */
const LEAF_COLLIDERS: Record<DoorId, Collider> = {
  d1: boxCollider(CENTRAL2_DOORS.d1.x, CENTRAL2_DOORS.d1.z, DOOR.w, DOOR.depth, DOOR.h),
  d2: boxCollider(CENTRAL2_DOORS.d2.x, CENTRAL2_DOORS.d2.z, DOOR.w, DOOR.depth, DOOR.h),
  d3: boxCollider(CENTRAL2_DOORS.d3.x, CENTRAL2_DOORS.d3.z, DOOR.depth, DOOR.w, DOOR.h),
  d4: boxCollider(CENTRAL2_DOORS.d4.x, CENTRAL2_DOORS.d4.z, DOOR.depth, DOOR.w, DOOR.h),
};

/** 닫힌 문짝만 충돌이 된다 — 순수 함수라 시험이 저장소 없이 부른다 */
export function central2DoorColliders(doors: Readonly<Record<DoorId, boolean>>): Collider[] {
  return DOOR_IDS.filter((id) => !doors[id]).map((id) => LEAF_COLLIDERS[id]);
}

/** 문 상태별 충돌 목록 캐시 — 매 프레임 배열을 새로 잇지 않으려고. 상태는 넷의 열림/닫힘뿐이라 키가 짧다 */
let doorKey = '';
let withDoors: readonly Collider[] = COLLIDERS;
function collidersNow(): readonly Collider[] {
  const doors = central2.get().doors;
  const key = DOOR_IDS.map((id) => (doors[id] ? '1' : '0')).join('');
  if (key !== doorKey) {
    doorKey = key;
    const closed = central2DoorColliders(doors);
    withDoors = closed.length ? [...COLLIDERS, ...closed] : COLLIDERS;
  }
  return withDoors;
}

/** 부를 때마다 저장소를 본다 — 락다운이 문을 닫은 프레임부터 문짝이 막는다 */
export function resolveCentral2Colliders(p: THREE.Vector3, feetY: number) {
  const out = resolveCollisions(p.x, p.z, feetY, undefined, collidersNow());
  p.x = out.x;
  p.z = out.z;
}

export function central2GroundHeightAt(x: number, z: number, fromY: number): number {
  return groundHeightWith(x, z, fromY, COLLIDERS);
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
