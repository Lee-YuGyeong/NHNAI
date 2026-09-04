/**
 * 창이 있는 방 — 마지막 방 직전의 작은 방. 벽화 `window` 가 그린 **해가 실제로 있는 곳**이다.
 *
 * 리더의 자리다. 이 구역에서 창이 있는 방은 여기뿐이고, 그래서 리더가 여기 있다.
 * 창살 안에서 해를 그린 개체는 이 창을 봤던 것이다 — 그림에 창살이 있었으므로 **이 창에도 창살이 있다.**
 * 벽화가 사생이었다는 것을 그림과 실물을 나란히 본 사람만 안다.
 *
 * 여기서는 아무 일도 안 일어난다. 30 초짜리 정적이면 된다 (features/world2/scenario2.ts) —
 * 바로 다음 방에서 그 리더가 나를 지목하기 때문에, 그 30 초가 값을 한다.
 */

import * as THREE from 'three';

import type { Fit, InstanceItem } from '@/world/map/corridor/part';
import { Instanced, Parts, type Item } from '@/world/map/parts';
import {
  Doorway,
  RibRun,
  Shell,
  WallKit,
  hdr,
  makeEndWallGeometry,
  makeRibGeometry,
  openingFor,
  ribStrips,
  upperTubes,
  useSciTextures,
  useScreenMaterials,
  useShapedMaterial,
  wallTubes,
} from '@/world/map/scifi';
import { groundHeightAt as groundHeightWith, resolveCollisions } from '@/world/mp/collide';
import type { QualityTier } from '@/world/perf/quality';

import { exitDoor } from './exitDoor';
import { SlidingLeaf } from './leaf';
import { GAP, NO_CONSOLES, NO_ITEMS, RIB, RING_MODEL, makeRoom } from './room';

/* ─────────────────────────────── 방 ─────────────────────────────── */

/**
 * **5 × 5 m** — 레벨 설계 「누가 듣고 있나」는 4 × 4 다 (2026-09-02 사용자: 「기획에 어긋난 맵이 있는지」).
 * 「창이 있는 방은 통로 끝 4 × 4」 — 방이 아니라 **복도의 끝**이다. 한때 9 × 13 으로 지었는데,
 * 그러면 리더와 나 사이에 걸어 다닐 자리가 생기고, 그 자리가 30 초짜리 정적을 헐겁게 만든다.
 * 4 × 4 에서는 나가는 문턱(z ≤ −1.2)까지 리더를 지나칠 띠가 1.4 m 뿐이라 문 앞에서 몸끼리 끼었다 (2026-09-03) —
 * 5 × 5 는 지나칠 수는 있되 여전히 물러설 데는 없는 크기다.
 */
export const WINDOW_ROOM = makeRoom({ wallX: 2.5, farZ: -2.5, nearZ: 2.5, wallTopY: 2.9, ceilingY: 3.6, bay: 4 });
const { m: M, bays: BAYS, ribs: RIB_ZS } = WINDOW_ROOM;

/**
 * 창 — 오른쪽 벽. 창살이 넷 (벽화의 그것과 같은 수).
 * **높이 단다** (레벨 설계 05: 「빛만 들어오고 밖은 잘 안 보이게」) — 턱이 1.75 m 라 올려다봐야 하늘이 보인다.
 */
export const WINDOW = { z: 0, w: 2.4, h: 1.15, sill: 1.75, bars: 4 } as const;
const WALL_X = WINDOW_ROOM.profile.wallX;
const WIN_Y = WINDOW.sill + WINDOW.h / 2;

/**
 * 창 앞 — 리더가 서는 자리 (features/world2 가 쓴다). **창을 정면으로 막지 않는다**: 들어서면 창이 먼저 보이고 그다음에 그가 보여야 한다.
 * 그리고 문(가까운 끝) 정반대다 — 나가려면 그를 지나쳐야 한다는 것이 눈으로 읽혀야 한다 (레벨 설계 02).
 */
export const WINDOW_STAND = { x: WALL_X - 1.4, z: WINDOW.z - 1.4 } as const;
/** 들어오면 창을 보고 시작한다. 이 방에 다른 볼 것은 없다 */
export const WINDOW_FOCUS = { x: WALL_X, y: WIN_Y, z: WINDOW.z } as const;
export const WINDOW_EXIT_Z = WINDOW_ROOM.profile.farZ + 0.8;
/** 들어와 서는 자리 — 들어온 문 바로 안 (world2/map/index.ts SPAWN2 가 쓴다). 5 m 방이라 문에서 반 걸음이다 */
export const WINDOW_SPAWN = { x: 0, z: WINDOW_ROOM.profile.nearZ - 0.5 } as const;
/**
 * 「밖을 본 것」의 자리 — 창의 **왼쪽**(들어선 사람 기준 반대 벽 쪽), 창을 건너다본다.
 * 휴게 구역에서 아무것도 없는 벽을 보던 것이 여기서는 진짜 창을 본다 — 같은 개체, 같은 자세, 다른 벽.
 * 리더(WINDOW_STAND)와 문 사이가 아니라 리더 맞은편이라 셋이 삼각형이 된다: 나·리더·그것이 서로 다 보인다.
 */
export const WINDOW_SEER_SPOT = { x: -1.5, z: 0.8 } as const;

/* ── 창의 재료 ── */

/**
 * 바깥 — **빛이지 풍경이 아니다** (레벨 설계 05: 「빛만 들어오고 밖은 잘 안 보이게」).
 * 흰 것에 가까운 하늘 하나에 해가 **번져** 있다. 한때 노란 원반을 그렸는데, 그러면 「해가 보인다」가 되고
 * 그림 속 해와 실물이 같은 모양으로 나란히 서 버린다 — 벽화의 해는 이 창의 빛을 **기억으로** 그린 것이어야 한다.
 * 색을 넣지 않는 이유는 그대로다: 색을 넣는 순간 「어디 바깥인지」를 설명하게 된다.
 * 텍스처는 코드로 만든다(DataTexture) — 캔버스가 없는 시험 환경에서도 이 모듈이 읽혀야 한다.
 */
const SKY = { w: 64, h: 32, base: [219, 232, 245], glow: [255, 244, 208], at: [0.24, 0.8], sigma: 0.62, peak: 0.6 } as const;
function makeSkyTexture(): THREE.DataTexture {
  const data = new Uint8Array(SKY.w * SKY.h * 4);
  for (let j = 0; j < SKY.h; j += 1) {
    for (let i = 0; i < SKY.w; i += 1) {
      // 판 위의 실제 거리(m)로 잰다 — 창이 가로로 길어서 uv 로 재면 해가 납작해진다
      const dx = ((i + 0.5) / SKY.w - SKY.at[0]) * WINDOW.w;
      const dy = ((j + 0.5) / SKY.h - SKY.at[1]) * WINDOW.h;
      const k = SKY.peak * Math.exp(-(dx * dx + dy * dy) / (2 * SKY.sigma * SKY.sigma));
      const o = (j * SKY.w + i) * 4;
      for (let c = 0; c < 3; c += 1) data[o + c] = Math.round(SKY.base[c] + (SKY.glow[c] - SKY.base[c]) * k);
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, SKY.w, SKY.h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
const SKY_MAT = new THREE.MeshBasicMaterial({ map: makeSkyTexture(), color: hdr('#ffffff', 1.15), toneMapped: false });
const FRAME_MAT = new THREE.MeshStandardMaterial({ color: '#242c36', roughness: 0.55, metalness: 0.65 });
/** 창살 — 벽화에 있던 것과 같은 수, 같은 굵기감 */
const BAR_MAT = new THREE.MeshStandardMaterial({ color: '#1a2029', roughness: 0.7, metalness: 0.5 });

const BAR_ITEMS: Item[] = Array.from({ length: WINDOW.bars }, (_, i): Item => {
  const t = (i + 1) / (WINDOW.bars + 1);
  return { position: [WALL_X - 0.09, WIN_Y, WINDOW.z - WINDOW.w / 2 + WINDOW.w * t], scale: [0.05, WINDOW.h - 0.04, 0.07] };
});

/** 창이 바닥에 내리는 빛 — 실제 광원 하나로는 모서리가 안 나온다. 옅은 판을 겹쳐 자리를 그린다 */
const PATCH_MAT = new THREE.MeshBasicMaterial({ color: '#cfe0f2', transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending });

/* ── 벽 · 문 ── */

/** 기록 복도와 같은 좁은 문 — 5 m 벽에 공용 격납문(3.6 m)을 달면 벽이 거의 문이 된다 */
const WIN_DOOR = { w: 2.2, h: 3.0, depth: 0.3 } as const;
const WIN_RING = { scale: 4, sink: 0.12 * 4, thickness: 0.7 } as const;
const OPENING = openingFor(WIN_DOOR);
const END_WALL_GEO = makeEndWallGeometry(M, undefined, OPENING);
const RIB_GEO = makeRibGeometry(M, RIB);
const UPPER = upperTubes(M, BAYS);
/** 벽 세로 튜브 — 복도와 같은 벽 한 벌. 창이 밝아야 하므로 방도 어둡지 않아야 대비가 산다 */
const WALL = wallTubes(M, BAYS);
const STRIPS = ribStrips(M, RIB_ZS, RIB);

const RING_FIT: Fit = { x: WIN_RING.thickness, y: RING_MODEL.h * WIN_RING.scale, z: RING_MODEL.w * WIN_RING.scale };
const RING_ITEMS: InstanceItem[] = [
  { position: [0, -WIN_RING.sink, WINDOW_ROOM.profile.farZ + WIN_RING.thickness / 2], rotationY: Math.PI / 2 },
  { position: [0, -WIN_RING.sink, WINDOW_ROOM.profile.nearZ - WIN_RING.thickness / 2], rotationY: Math.PI / 2 },
];
const DOOR_FIT: Fit = { x: WIN_DOOR.depth, y: WIN_DOOR.h, z: WIN_DOOR.w };
const NEAR_DOOR_ITEMS: InstanceItem[] = [{ position: [0, 0, WINDOW_ROOM.profile.nearZ - WIN_DOOR.depth / 2 - GAP], rotationY: Math.PI / 2 }];
/** 나가는 문 — 이 방에서는 **안 열린다** (canLeave 가 false). 리더 뒤의 닫힌 문이 「나가려면 그를 지나쳐야 한다」를 눈으로 말한다 */
const FAR_DOOR_ITEMS: InstanceItem[] = [{ position: [0, 0, WINDOW_ROOM.profile.farZ + WIN_DOOR.depth / 2 + GAP], rotationY: -Math.PI / 2 }];

/* ─────────────────────────────── 건물 ─────────────────────────────── */

export function WindowRoom(_props: { quality?: QualityTier }) {
  const tex = useSciTextures();
  const screenMats = useScreenMaterials(tex.console);
  const ringMat = useShapedMaterial('sci_bulkhead');
  const doorMat = useShapedMaterial('sci_blast_door');

  return (
    <group name="창이 있는 방">
      <Shell m={M} tex={tex} endWall={END_WALL_GEO} />
      <RibRun geometry={RIB_GEO} zs={RIB_ZS} />
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

      {/* 창 — 벽면 바로 안쪽에 하늘을 붙이고, 그 앞에 창살과 틀을 세운다 */}
      <group name="창" position={[0, 0, 0]}>
        <mesh position={[WALL_X - 0.02, WIN_Y, WINDOW.z]} rotation={[0, -Math.PI / 2, 0]} material={SKY_MAT}>
          <planeGeometry args={[WINDOW.w, WINDOW.h]} />
        </mesh>
        <Instanced name="창살" items={BAR_ITEMS} material={BAR_MAT} />
        <mesh position={[WALL_X - 0.06, WINDOW.sill - 0.06, WINDOW.z]} material={FRAME_MAT}>
          <boxGeometry args={[0.22, 0.12, WINDOW.w + 0.3]} />
        </mesh>
        <mesh position={[WALL_X - 0.06, WINDOW.sill + WINDOW.h + 0.06, WINDOW.z]} material={FRAME_MAT}>
          <boxGeometry args={[0.22, 0.12, WINDOW.w + 0.3]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[WALL_X - 0.06, WIN_Y, WINDOW.z + s * (WINDOW.w / 2 + 0.09)]} material={FRAME_MAT}>
            <boxGeometry args={[0.22, WINDOW.h + 0.24, 0.18]} />
          </mesh>
        ))}
      </group>

      {/* 창이 바닥에 내려놓은 밝은 자리 — 이 방에서 유일하게 따뜻한 바닥이다 */}
      <mesh position={[WALL_X - 1.3, 0.014, WINDOW.z + 0.35]} rotation-x={-Math.PI / 2} material={PATCH_MAT} renderOrder={6}>
        <planeGeometry args={[WINDOW.w + 0.4, 2.2]} />
      </mesh>

      <Doorway z={WINDOW_ROOM.profile.farZ} dir={-1} opening={OPENING} />
      <Doorway z={WINDOW_ROOM.profile.nearZ} dir={1} opening={OPENING} />
      <Parts id="sci_bulkhead" fit={RING_FIT} items={RING_ITEMS} material={ringMat} />
      <Parts id="sci_blast_door" fit={DOOR_FIT} items={NEAR_DOOR_ITEMS} material={doorMat} />
      <SlidingLeaf name="나가는 문짝" open={exitDoor.isOpen} h={WIN_DOOR.h} fit={DOOR_FIT} items={FAR_DOOR_ITEMS} material={doorMat} />
    </group>
  );
}

/* ─────────────────────────────── 조명 ─────────────────────────────── */

/**
 * 방은 복도(world1)와 같은 밝기고, **창은 그보다 세다.** 시설의 빛보다 바깥 빛이 밝다 —
 * 리더가 왜 이 방을 자기 자리로 삼았는지를 조명 값 하나로 말한다.
 * 방 등은 4 × 4 → 5 × 5 (2026-09-03) 에 맞춰 8/8 → 11/9 로 했다가 「어두워 밝게해줘」라 **18/10**, 반구광 1.5 → 1.8 — 광원 하나가 방 전체를 맡는데 방이 1.5 배 넓어졌다.
 * 창의 등도 11/8 → 16/9 — 방만 올리면 「창이 방보다 세다」가 뒤집힌다. 헤드리스 평균 31/43/62 → 40/54/76 (다섯 방 중 가장 밝다).
 */
export function WindowLights(_props: { flicker: boolean }) {
  return (
    <>
      <hemisphereLight args={['#a4b6cf', '#2a313c', 1.8]} />
      {BAYS.map((z) => (
        <pointLight key={z} position={[0, WINDOW_ROOM.profile.ceilingY - 1.0, z]} intensity={18} distance={10} decay={1.7} color="#9cc3ff" />
      ))}
      <pointLight position={[WALL_X - 0.6, WIN_Y, WINDOW.z]} intensity={16} distance={9} decay={1.6} color="#e8f0fa" />
    </>
  );
}

/* ─────────────────────────────── 충돌 ─────────────────────────────── */

const COLLIDERS = WINDOW_ROOM.colliders;

export function resolveWindowColliders(p: THREE.Vector3, feetY: number) {
  const out = resolveCollisions(p.x, p.z, feetY, undefined, COLLIDERS);
  p.x = out.x;
  p.z = out.z;
}

export function windowGroundHeightAt(x: number, z: number, fromY: number): number {
  return groundHeightWith(x, z, fromY, COLLIDERS);
}
