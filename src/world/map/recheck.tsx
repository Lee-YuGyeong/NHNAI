/**
 * 재검실 — 3D 월드의 다섯 번째 배경, **챕터 3 의 무대**. 검문에서 감독이 `detain` 을 고르면 여기로 끌려온다.
 *
 * 작고 비었다. 복도·중앙 시설과 같은 8각 강판 셸(공용 키트 map/scifi.tsx)에 리브 셋, 옆벽 콘솔 넷,
 * 등 뒤에 격벽 링과 **열리지 않는** 격납문 하나. 앞에는 검증대와 그 위 화면 셋, 그리고 서야 하는 자리에
 * 링 조명과 바닥 표식이 겹친다.
 *
 * 여기서 볼 것을 줄인 것은 절제가 아니라 설계다 — 이 방에는 대본이 없고(features/world/chapter3.ts),
 * 플레이어가 읽어야 하는 것은 벽이 아니라 **자기가 여태 무슨 말을 했는가**다 (features/world/dossier.ts).
 * 꾸미는 것은 나중에 얹는다 (2026-08-30 사용자).
 *
 * 치수·배치·충돌은 전부 recheck/layout.ts. 여기에는 **씬만 있다** — 캔버스·카메라·이동·네트워크는 scene/WorldScene.tsx 가 쥔다.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

import { groundHeightAt as groundHeightWith, resolveCollisions } from '../mp/collide';
import { doors } from '../mp/doors';
import type { QualityTier } from '../perf/quality';
import type { Fit, InstanceItem } from './corridor/part';
import { Instanced, Parts, type Item } from './parts';
import {
  BAY_CENTERS,
  BAY_LIGHT,
  COLLIDERS,
  CONSOLE_BAYS,
  DESK,
  DESK_LIGHT,
  DESK_STRIP,
  DOOR,
  FAR_Z,
  FOCUS,
  GAP,
  LAMP,
  M,
  MARK,
  NEAR_Z,
  RIB,
  RIB_ZS,
  RING,
  SPOT,
  SPOT_LIGHT,
  WALL_SCREENS,
} from './recheck/layout';
import {
  Doorway,
  RibRun,
  STRIP_MAT,
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
  upperTubes,
  useSciTextures,
  useScreenMaterials,
  useShapedMaterial,
  wallTubes,
} from './scifi';

export { FOCUS as RECHECK_FOCUS };

/* ─────────────────────────────── 지오메트리 · 배치 (모듈 수준 상수) ─────────────────────────────── */

/**
 * 끝벽이 둘인데 하나만 뚫는다 — 먼 끝벽 뒤에는 검증대와 화면이 붙어 있어 막혀 있어야 하고,
 * 들어온 끝벽에는 문이 있다. 그래서 Shell 에 nearWall 을 따로 준다 (2026-08-30 사용자: "문 열릴 때 벽이 보인다").
 */
const OPENING = openingFor(DOOR);
const END_WALL_GEO = makeEndWallGeometry(M);
const DOOR_WALL_GEO = makeEndWallGeometry(M, undefined, OPENING);
const RIB_GEO = makeRibGeometry(M, RIB);

const UPPER = upperTubes(M, BAY_CENTERS);
const WALL = wallTubes(M, BAY_CENTERS);
const SCREENS = dataScreens(M, BAY_CENTERS);
const PANELS = panelFaces(M, BAY_CENTERS);
const STRIPS = ribStrips(M, RIB_ZS, RIB);
const CONSOLES = sideConsoles(M, CONSOLE_BAYS);

/* ── 등 뒤 격벽 링 · 격납문 (GLB) ── */

/** Tripo 링 모델 치수 — 폭 0.894 · 높이 1. 균등 배율이어야 챔퍼가 45° 로 남는다 (복도와 같다) */
const RING_MODEL = { w: 0.894, h: 1 } as const;
const RING_FIT: Fit = { x: RING.thickness, y: RING_MODEL.h * RING.scale, z: RING_MODEL.w * RING.scale };
const RING_ITEMS: InstanceItem[] = [{ position: [0, -RING.sink, NEAR_Z - RING.thickness / 2], rotationY: Math.PI / 2 }];
const DOOR_FIT: Fit = { x: DOOR.depth, y: DOOR.h, z: DOOR.w };
/** 문 모델의 정면이 +x — 등 뒤 끝벽은 −z 를 보게 +π/2 */
const DOOR_ITEMS: InstanceItem[] = [{ position: [0, 0, NEAR_Z - DOOR.depth / 2 - GAP], rotationY: Math.PI / 2 }];
/** 문짝이 올라가는 속도(m/s) — 복도·중앙 시설과 같다 */
const DOOR_OPEN_SPEED = 1.1;

/**
 * 재검실의 문 — 들어올 때는 닫혀 있고(나갈 길이 없다는 게 이 방의 전부다), 챕터 3 이 끝나면 열린다.
 * 통과했든 끌려 나가든 이 문으로 나간다 (features/world/chapter3.ts 의 leave → doors.openRecheck).
 */
function ExitDoor({ material }: { material: THREE.Material }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const targetY = doors.get().recheck * (DOOR.h + 0.2);
    if (Math.abs(g.position.y - targetY) < 1e-3) return;
    g.position.y += Math.sign(targetY - g.position.y) * Math.min(Math.abs(targetY - g.position.y), DOOR_OPEN_SPEED * Math.min(delta, 0.1));
  });
  return (
    <group ref={group}>
      <Parts id="sci_blast_door" fit={DOOR_FIT} items={DOOR_ITEMS} material={material} />
    </group>
  );
}

/* ── 검증대 ── */

const DESK_MAT = new THREE.MeshStandardMaterial({ color: '#28313d', roughness: 0.55, metalness: 0.6 });
/** 검증대 턱의 발광 띠 — 앞면 아래쪽 */
const DESK_STRIPS: Item[] = [
  {
    position: [DESK.x, DESK.h - DESK_STRIP.h, DESK.z + DESK.d / 2 + DESK_STRIP.lift],
    scale: [DESK.w - 0.2, DESK_STRIP.h, 0.03],
  },
];
/** 끝벽 화면 셋 — 검증대 위. 벽면에서 살짝 띄운다 */
const WALL_SCREEN_ITEMS: Item[] = WALL_SCREENS.xs.map((x): Item => ({
  position: [x, WALL_SCREENS.y, FAR_Z + 0.014],
  scale: [WALL_SCREENS.w, WALL_SCREENS.h, 0.024],
}));

/* ── 링 조명 ── */

const LAMP_FIT: Fit = { x: LAMP.r * 2 + 0.16 };
const LAMP_ITEM: InstanceItem[] = [{ position: [SPOT.x, LAMP.y - 0.1, SPOT.z] }];
const LAMP_MAT = new THREE.MeshBasicMaterial({ color: hdr('#dceeff', 1.8), toneMapped: false });
/** 아래로 퍼지는 빛기둥 — 아주 옅게. 진하면 "눈 아프다" (2026-08-29 규칙) */
const BEAM_MAT = new THREE.MeshBasicMaterial({
  color: '#9fd0ff',
  transparent: true,
  opacity: 0.03,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});

/* ─────────────────────────────── 건물 ─────────────────────────────── */

export interface RecheckProps {
  /** 품질 단계 — 이 맵은 쓰지 않는다 (MapDef.Scene 의 시그니처) */
  quality?: QualityTier;
}

export function Recheck(_props: RecheckProps) {
  const tex = useSciTextures();
  const screenMats = useScreenMaterials(tex.console);
  const ringMat = useShapedMaterial('sci_bulkhead');
  const consoleMat = useShapedMaterial('sci_console');
  const doorMat = useShapedMaterial('sci_blast_door');

  const beamH = LAMP.y - 0.1;

  return (
    <group name="재검실">
      <Shell m={M} tex={tex} endWall={END_WALL_GEO} nearWall={DOOR_WALL_GEO} />
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

      {/* 검증대 — 심문하는 쪽이 이 뒤에 선다 */}
      <group name="검증대">
        <mesh position={[DESK.x, DESK.h / 2, DESK.z]} material={DESK_MAT}>
          <boxGeometry args={[DESK.w, DESK.h, DESK.d]} />
        </mesh>
        <Instanced name="검증대 발광 띠" items={DESK_STRIPS} material={STRIP_MAT} receiveShadow={false} />
        <Instanced name="끝벽 화면" items={WALL_SCREEN_ITEMS} material={screenMats.screen} receiveShadow={false} />
      </group>

      {/* 서야 하는 자리 — 바닥 표식과 그 위 링 조명 */}
      <group name="검증 자리" position={[SPOT.x, 0, SPOT.z]}>
        <mesh position={[0, 0.012, 0]} rotation-x={-Math.PI / 2} material={STRIP_MAT}>
          <torusGeometry args={[MARK.r, MARK.ring / 2, 8, 64]} />
        </mesh>
        <mesh position={[0, LAMP.y - 0.11, 0]} rotation-x={Math.PI / 2} material={LAMP_MAT}>
          <torusGeometry args={[LAMP.r, LAMP.tube * 0.5, 8, 48]} />
        </mesh>
        <mesh position={[0, beamH / 2, 0]} material={BEAM_MAT} renderOrder={10}>
          <cylinderGeometry args={[LAMP.r * 0.55, LAMP.r * 1.25, beamH, 24, 1, true]} />
        </mesh>
      </group>
      <Parts id="ring_lamp" fit={LAMP_FIT} items={LAMP_ITEM} receiveShadow={false} />

      {/* 등 뒤 — 들어온 문. 그 뒤는 어두운 문간이라 문이 열려도 벽이 아니라 안쪽이 보인다 */}
      <Doorway z={NEAR_Z} dir={1} opening={OPENING} />
      <Parts id="sci_bulkhead" fit={RING_FIT} items={RING_ITEMS} material={ringMat} />
      <ExitDoor material={doorMat} />
    </group>
  );
}

/* ─────────────────────────────── 조명 ─────────────────────────────── */

/** 실제 광원 6개 — bay 4 · 검증대 1 · 링 조명 1. 그림자를 굽는 광원은 없다 */
export function RecheckLights(_props: { flicker: boolean }) {
  return (
    <>
      <hemisphereLight args={['#a4b6cf', '#2a313c', 1.2]} />
      {BAY_CENTERS.map((z) => (
        <pointLight key={z} position={[0, BAY_LIGHT.y, z]} intensity={BAY_LIGHT.intensity} distance={BAY_LIGHT.distance} decay={1.7} color="#9cc3ff" />
      ))}
      <pointLight position={[DESK.x, DESK_LIGHT.y, DESK_LIGHT.z]} intensity={DESK_LIGHT.intensity} distance={DESK_LIGHT.distance} decay={1.7} color="#b9d4ff" />
      <pointLight position={[SPOT.x, SPOT_LIGHT.y, SPOT.z]} intensity={SPOT_LIGHT.intensity} distance={SPOT_LIGHT.distance} decay={1.8} color="#dceeff" />
    </>
  );
}

/* ─────────────────────────────── 충돌 ─────────────────────────────── */

export function resolveRecheckColliders(p: THREE.Vector3, feetY: number) {
  const out = resolveCollisions(p.x, p.z, feetY, undefined, COLLIDERS);
  p.x = out.x;
  p.z = out.z;
}

export function recheckGroundHeightAt(x: number, z: number, fromY: number): number {
  return groundHeightWith(x, z, fromY, COLLIDERS);
}
