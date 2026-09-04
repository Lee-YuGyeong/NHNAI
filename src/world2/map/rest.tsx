/**
 * 휴게 구역 — 시나리오 2 가 짓는 첫 방. **이 게임이 지키려는 것을 처음 보여주는 자리다.**
 *
 * 이야기는 「AI 가 쉬려고 만든 구역」에 잠입하는 것인데, 본판은 쉬는 곳을 한 번도 안 보여주고 벽화로만 말한다.
 * 그래서 이 방에는 검문이 없고, 경비가 없고, 방송이 없다 — 벽의 데이터 화면과 패널도 뺐다(그게 검문의 얼굴이다).
 * 남은 것은 낮은 좌대와 아주 흐린 빛뿐이고, 개체들은 그 위에 앉아 **아무것도 안 한다** (features/world2/Unit.tsx).
 *
 * 이 방이 조용한 것은 절제가 아니라 규칙이다: 마지막 방에서 리더가 「우리는 쉬려고 여기 있다」고 할 때
 * 그 문장이 플레이어가 **실제로 본 것**을 가리켜야 한다.
 *
 * 치수·충돌은 world2/map/room.ts 가 만든다. 부품은 본판과 같은 키트(world/map/scifi.tsx) — 같은 시설이어야 한다.
 */

import * as THREE from 'three';

import type { Fit, InstanceItem } from '@/world/map/corridor/part';
import { Instanced, Parts, type Item } from '@/world/map/parts';
import {
  Doorway,
  RibRun,
  Shell,
  WallKit,
  makeEndWallGeometry,
  makeRibGeometry,
  openingFor,
  ribStrips,
  upperTubes,
  wallTubes,
  useSciTextures,
  useScreenMaterials,
  useShapedMaterial,
} from '@/world/map/scifi';
import { groundHeightAt as groundHeightWith, resolveCollisions } from '@/world/mp/collide';
import type { QualityTier } from '@/world/perf/quality';

import { exitDoor } from './exitDoor';
import { SlidingLeaf } from './leaf';
import { GAP, NO_CONSOLES, NO_ITEMS, RIB, RING_MODEL, boxCollider, makeRoom } from './room';

/* ─────────────────────────────── 방 ─────────────────────────────── */

/**
 * **16 × 18 m** — 레벨 설계 「누가 듣고 있나」는 12 × 14 라고 적었다 (2026-09-02 사용자: 「기획에 어긋난 맵이 있는지」).
 * 한때 18 × 22 로 지었다가 12 × 14 로 줄였는데, 거기에 여덟(서 있는 다섯 + 서성이는 하나 + 배경 둘)을 넣으니
 * 문→문 직선(x 0) 위에서 서성이는 A-201 과 배경 둘이 사람 앞에서 영영 멎었다 (2026-09-03). 그래서 한 단계 넓힌다:
 * 비켜 설 옆이 있어야 「비켜 준다」가 성립한다. 「통과만 하려면 직선」은 그대로다 — 입구와 출구가 마주 보고, 가운데가 비어 있다.
 * 이 방의 규칙은 **목격 반경 = 방 전체**라서 치수가 곧 밸런스다 — 반경은 방을 따라 커진다(scenario2 ROOM_RADIUS).
 *
 * ★ 천장은 설계가 2.2 m 라고 적었지만 **2.9 m** 로 세운다. 공용 SF 키트(world/map/scifi.tsx)의 벽 세로 튜브가
 *   y 2.65 까지 올라가고 리브 띠가 2.6 까지 간다 — 2.2 로 내리면 그 한 벌이 천장을 뚫는다.
 *   설계가 노린 것은 절대값이 아니라 **복도(3.0)보다 낮다**이고, 그건 2.9 로도 지켜진다.
 */
/**
 * 24 × 28 m — 16 × 18 에서 넓혔다 (2026-09-03 사용자: 「두 번째 공간도 맵이 너무 작아」).
 * 이 방의 과제는 **가만히 있기**라 넓을수록 좋다: 가운데가 비어 있어야 「중앙에 서 있는 것이 곧 눈에 띄는 것」이 되는데,
 * 16 m 폭에서는 벽을 따라 놓은 단 사이가 13 m 라 어디 서든 벽 곁이었다. 24 m 면 가운데에 진짜 빈 자리가 생긴다.
 * 단(SEATS) · 자는 자리 · 서쪽 벽은 새 벽을 따라 같이 밀었다.
 * 높이도 같이 올렸다 — 수직 벽 2.2 → 3.3 → **4.2** · 천장 2.9 → 4.4 → **6.5** (2026-09-03 사용자, 두 번에 걸쳐).
 * 처음엔 복도(3.4 / 5.6)보다 낮게 잡았다 — 통로가 아니라 머무는 방이니 천장이 가까운 게 맞다고 봤는데, 그건 **좁은 방**의 논리다.
 * 24 × 28 m 는 방이 아니라 **홀**이고, 폭이 복도의 두 배 반인데 천장이 복도보다 낮으면 눌린 판으로 보인다.
 * 이제 복도보다 높다 — 넓은 쪽이 높은 것이 눈이 아는 규칙이다.
 */
export const REST = makeRoom({ wallX: 12, farZ: -16, nearZ: 12, wallTopY: 4.2, ceilingY: 6.5, bay: 3.5 });
const { m: M, bays: BAYS, ribs: RIB_ZS } = REST;

export const REST_FOCUS = { x: 0, y: 1.5, z: REST.profile.farZ + 2 } as const;
/** 나가는 문(먼 끝) 앞 — 여기 닿으면 다음 방이다 (features/world2/scenario2.ts) */
export const REST_EXIT_Z = REST.profile.farZ + 2.0;

/* ── 자리 — 이 방이 정하는 두 자리 (features/world2/Room2Scene 이 쓴다) ── */

/**
 * 자는 개체의 자리 — **가장 안쪽 구석** (레벨 설계 05: 「일부러 찾아가야 보이는 자리」).
 * 들어온 문에서 가장 먼 −x 구석, 벽 단이 꺾이는 모서리 바로 앞이다. 나가는 문 옆이라 지나치기는 쉽고 들여다보기는 어렵다.
 * 단 위(y 0.44)가 아니라 바닥이다 — 개체는 서는 것밖에 모른다 (Unit.tsx 의 자세는 idle/walk 둘).
 */
export const REST_DOZE_SPOT = { x: -10.4, z: -15.1 } as const;
/**
 * 「밖을 본 것」의 자리 — **아무것도 없는 서쪽 벽**(−x) 앞 (레벨 설계 04: 「저긴 벽인데」라고 생각하게).
 * 벽에 코를 박다시피 서서 −x 를 본다(heading −π/2). 그 자리의 벽은 일부러 비워 뒀다 — 단도 세로 튜브도 없다 (아래 SEATS · WALL).
 * 6 m 규칙: 가운뎃줄을 오가는 A-201 의 자리(0, 1)에서 8.9 m, 배경 개체의 꼭짓점(−4.5, 1.5)에서 5.4 m.
 * 벽에서 0.8 — 「코를 박다시피」는 그대로되, 사람이 등 뒤를 지나갈 수는 있게.
 */
export const REST_WEST_WALL = { x: -11.2, z: 10.2 } as const;

/* ── 좌대 — 개체들이 앉는 자리 ── */

/**
 * 의자가 아니라 **단**이다. 등받이도 팔걸이도 없다 — 이 시설은 쉬라고 만든 가구를 모른다.
 *
 * ★ **벽을 따라서만** 놓는다 (레벨 설계 03). 한때 가운데에도 섬 둘을 놓았는데 그건 규칙 위반이다:
 *   이 방은 「기둥·화물·칸막이 전부 금지」이고, 가운데가 비어 있어야 **중앙에 서 있는 것이 곧 눈에 띄는 것**이 된다.
 *   숨을 데가 하나라도 있으면 「가만히 있기」가 과제가 아니라 숨바꼭질이 된다.
 */
export const SEATS = [
  { x: -11.3, z: -9.0, w: 1.3, d: 11.0 },
  // 서쪽 벽의 들어온 쪽 단은 짧다 — z 5.3 부터 문까지가 「아무것도 없는 벽」이다 (REST_WEST_WALL)
  { x: -11.3, z: 2.6, w: 1.3, d: 5.4 },
  { x: 11.3, z: -9.0, w: 1.3, d: 11.0 },
  { x: 11.3, z: 5.0, w: 1.3, d: 11.0 },
] as const;
export const SEAT_H = 0.44;

const SEAT_MAT = new THREE.MeshStandardMaterial({ color: '#2b333d', roughness: 0.78, metalness: 0.35 });
const SEAT_ITEMS: Item[] = SEATS.map((s): Item => ({ position: [s.x, SEAT_H / 2, s.z], scale: [s.w, SEAT_H, s.d] }));
/** 단의 턱에 아주 옅은 띠 하나 — 무광 강판에서 앉는 면이 안 읽힌다. 빛은 이 방에서 가장 약하다 */
const SEAT_STRIPS: Item[] = SEATS.map((s): Item => ({ position: [s.x, SEAT_H - 0.03, s.z], scale: [s.w - 0.12, 0.02, s.d - 0.12] }));

/* ── 문 ── */

/**
 * 문도 링도 **이 방 것을 따로 쓴다** (기록 복도·창이 있는 방과 같은 방식).
 * 공용 격납문(3.6 × 3.7)은 개구가 y 3.58 까지라 천장 2.9 를 뚫는다 — 끝벽의 구멍이 바깥 윤곽선을 넘으면
 * 삼각분할이 깨지고, 문짝은 천장 위로 솟는다. 링도 scale 6 은 절반이 셸 밖이었다.
 * 낮은 문이 이 방의 뜻이기도 하다: 허리를 굽히고 들어가는 방, 검문할 것이 없는 방.
 * 링은 꼭대기(scale − sink = 0.88 × scale)가 천장 아래 머무는 가장 큰 값이다.
 */
// 천장 6.5 · 폭 24 에 맞춰 문과 링도 키웠다 (2.2 × 2.5 → 3.0 × 3.6 · 링 3.3 → 5.2)
const REST_DOOR = { w: 3.0, h: 3.6, depth: 0.3 } as const;
const REST_RING = { scale: 5.2, sink: 0.12 * 5.2, thickness: 0.7 } as const;
const OPENING = openingFor(REST_DOOR);
const END_WALL_GEO = makeEndWallGeometry(M, undefined, OPENING);
const RIB_GEO = makeRibGeometry(M, RIB);
const UPPER = upperTubes(M, BAYS);
/**
 * 벽 세로 튜브 — **되돌렸다** (2026-09-01 사용자: "너무 어둡다. 밝기는 world1 과 비슷하게").
 * 한때 이 방의 벽 장식을 통째로 뺐었다("아무도 안 본다"를 없는 장식으로 말하려고). 그런데 복도(world1)의
 * 밝기는 실은 저 발광 튜브들이 만들고 있어서, 빼는 순간 방이 검은 상자가 됐다.
 * 「검문이 없다」는 **데이터 화면과 콘솔이 없는 것**으로 충분히 말한다 — 빛까지 뺄 일은 아니었다.
 */
/** 「밖을 본 것」이 보는 벽 한 칸(서쪽 · 들어온 쪽 bay)만 튜브를 뺀다 — 발광 튜브가 있으면 「아무것도 없는 벽」이 아니다 */
const isBareWall = (it: Item) => it.position[0] < 0 && Math.abs(it.position[2] - REST_WEST_WALL.z) < 1.5;
const WALL_ALL = wallTubes(M, BAYS);
const WALL = { bezels: WALL_ALL.bezels.filter((it) => !isBareWall(it)), tubes: WALL_ALL.tubes.filter((it) => !isBareWall(it)) };
const STRIPS = ribStrips(M, RIB_ZS, RIB);

const RING_FIT: Fit = { x: REST_RING.thickness, y: RING_MODEL.h * REST_RING.scale, z: RING_MODEL.w * REST_RING.scale };
const RING_ITEMS: InstanceItem[] = [
  { position: [0, -REST_RING.sink, REST.profile.farZ + REST_RING.thickness / 2], rotationY: Math.PI / 2 },
  { position: [0, -REST_RING.sink, REST.profile.nearZ - REST_RING.thickness / 2], rotationY: Math.PI / 2 },
];
const DOOR_FIT: Fit = { x: REST_DOOR.depth, y: REST_DOOR.h, z: REST_DOOR.w };
/** 들어온 문은 닫힌 채다 — 되돌아 나가는 길은 없다 */
const NEAR_DOOR_ITEMS: InstanceItem[] = [{ position: [0, 0, REST.profile.nearZ - REST_DOOR.depth / 2 - GAP], rotationY: Math.PI / 2 }];
/**
 * 나가는 문 — 90 초 주기가 열기 전까지 닫혀 있다 (scenario2 canLeave → exitDoor). 한때 문짝 없는 구멍이었는데
 * 목표에는 「다음 주기까지 문이 안 열린다」가 떠 있어서 말과 그림이 어긋났다 (2026-09-03 사용자: 「문이 없는 곳이 있다」)
 */
const FAR_DOOR_ITEMS: InstanceItem[] = [{ position: [0, 0, REST.profile.farZ + REST_DOOR.depth / 2 + GAP], rotationY: -Math.PI / 2 }];

/* ─────────────────────────────── 건물 ─────────────────────────────── */

export function Rest(_props: { quality?: QualityTier }) {
  const tex = useSciTextures();
  const screenMats = useScreenMaterials(tex.console);
  const ringMat = useShapedMaterial('sci_bulkhead');
  const doorMat = useShapedMaterial('sci_blast_door');

  return (
    <group name="휴게 구역">
      <Shell m={M} tex={tex} endWall={END_WALL_GEO} />
      <RibRun geometry={RIB_GEO} zs={RIB_ZS} />
      {/*
        벽 장식이 **한 벌 빠져 있다** — 세로 튜브·데이터 화면·패널 면·콘솔이 없다.
        그것들은 전부 「보고 있다」는 표시다. 여기서는 아무도 안 본다.
      */}
      <WallKit
        upper={UPPER}
        wall={WALL}
        screens={NO_ITEMS as Item[]}
        panels={NO_ITEMS as Item[]}
        strips={STRIPS}
        consoles={NO_CONSOLES}
        consoleMaterial={doorMat}
        screenMaterials={screenMats}
      />

      <group name="좌대">
        <Instanced name="단" items={SEAT_ITEMS} material={SEAT_MAT} />
        <Instanced name="단 턱" items={SEAT_STRIPS} material={SEAT_STRIP_MAT} receiveShadow={false} />
      </group>

      <Doorway z={REST.profile.farZ} dir={-1} opening={OPENING} />
      <Doorway z={REST.profile.nearZ} dir={1} opening={OPENING} />
      <Parts id="sci_bulkhead" fit={RING_FIT} items={RING_ITEMS} material={ringMat} />
      <Parts id="sci_blast_door" fit={DOOR_FIT} items={NEAR_DOOR_ITEMS} material={doorMat} />
      <SlidingLeaf name="나가는 문짝" open={exitDoor.isOpen} h={REST_DOOR.h} fit={DOOR_FIT} items={FAR_DOOR_ITEMS} material={doorMat} />
    </group>
  );
}

/** 좌대 턱의 띠 — 복도의 파란 띠보다 훨씬 어둡다. 이 방에서 빛나는 것은 이것뿐이다 */
const SEAT_STRIP_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color('#5f7893').multiplyScalar(0.5), toneMapped: false });

/* ─────────────────────────────── 조명 ─────────────────────────────── */

/**
 * 광원 넷 — bay 마다 하나. **다섯 방 중 가장 어둡다** (레벨 설계: 「조명 최저」 — 어두워서 내 몸은 안 읽히는데 말은 다 퍼지는,
 * 정반대로 걸린 방). 판독 거리 1.5 m 가 이 값에서 나온다.
 * 2026-09-01 의 「너무 어둡다」는 벽 튜브를 통째로 뺐을 때 얘기였다 — 튜브는 그대로 두고 광원만 내린다.
 * 그래서 벽은 복도처럼 읽히고 바닥과 가운데가 어둡다: 벽에 붙은 것은 보이고, 한가운데 선 것은 실루엣이다.
 * 복도보다 훨씬 넓고(16 m) 천장은 낮아서, 낮게 건다.
 * 헤드리스 스크린샷 평균(tools/scenario2-shots.mjs, 2026-09-02): 복도 36.3/56.2/87.8 · 이 방 15 일 때 30.8/48.9/78.1 → 6 일 때 18.3/30.7/51.7.
 *
 * ★ 열 셋 × bay 다섯 = 열다섯 (2026-09-03). 16 × 18 이 되며 한가운데 열 하나(거리 15)로 덮으니 벽까지 6 m 남는 자리는 감쇠 끝이라
 *   「어두워 밝게해줘」가 됐다 — 거리를 더 늘리는 대신 **양옆 열을 더 세운다** (키트 규칙: 큰 방은 bay 마다 등).
 *   한 등의 세기는 6 → 5.4, 거리 15 → 12 — 셋이 겹치는 가운데가 예전보다 크게 세지 않게. 벽 쪽 열은 벽에서 3 m: 벽 튜브·앉은 것들이 읽히는 자리다.
 *   반구광 1.5 → 1.7. 평균 18/31/52 → 26/44/71 — 복도(31/49/76)·작업 구역(31/49/77)보다는 여전히 어둡다. 「조명 최저」는 순위지 절대값이 아니다.
 */
const REST_LIGHT = { intensity: 5.4, distance: 12 } as const;
const REST_LIGHT_XS: readonly number[] = [-(M.wallX - 3), 0, M.wallX - 3];

export function RestLights(_props: { flicker: boolean }) {
  return (
    <>
      <hemisphereLight args={['#a4b6cf', '#2a313c', 1.7]} />
      {BAYS.flatMap((z) =>
        REST_LIGHT_XS.map((x) => (
          <pointLight key={`${x}:${z}`} position={[x, 2.15, z]} intensity={REST_LIGHT.intensity} distance={REST_LIGHT.distance} decay={1.6} color="#9cc3ff" />
        )),
      )}
    </>
  );
}

/* ─────────────────────────────── 충돌 ─────────────────────────────── */

const COLLIDERS = [...REST.colliders, ...SEATS.map((s) => boxCollider(s.x, s.z, s.w, s.d, SEAT_H))];

export function resolveRestColliders(p: THREE.Vector3, feetY: number) {
  const out = resolveCollisions(p.x, p.z, feetY, undefined, COLLIDERS);
  p.x = out.x;
  p.z = out.z;
}

export function restGroundHeightAt(x: number, z: number, fromY: number): number {
  return groundHeightWith(x, z, fromY, COLLIDERS);
}
