/**
 * 중앙 시설 — 3D 월드의 네 번째 배경. 복도 끝 격납문이 열리면 도착하는 곳 (챕터 1 의 마지막 무대).
 *
 * 복도·격납고와 같은 8각 강판 셸(map/scifi.tsx 공용 키트)을 크게 — 30×28, 천장 10. 한가운데 **코어 탑**(central/CoreTower.tsx —
 * 시나리오 2 도 같은 탑을 세우므로 거기로 뽑았다; 여기는 첫 사용처로, DAIS 중심·천장 10 을 넘긴다).
 * 양 끝에 격벽 링 + 격납문. AI 감시자·락다운 연출은 features/world/CentralChapterScene.tsx 가 얹는다.
 *
 * 여기에는 **씬만 있다.** 캔버스·카메라·이동·네트워크는 scene/WorldScene.tsx 가 쥔다. 맵 선택은 map/index.ts 의 MAPS.
 */

import { useRef } from 'react';
import * as THREE from 'three';

import { useFrame } from '@react-three/fiber';

import { groundHeightAt as groundHeightWith, resolveCollisions } from '../mp/collide';
import { doors } from '../mp/doors';
import type { QualityTier } from '../perf/quality';
import type { Fit, InstanceItem } from './corridor/part';
import { Parts } from './parts';
import {
  RibRun,
  Shell,
  WallKit,
  dataScreens,
  Doorway,
  makeEndWallGeometry,
  openingFor,
  makeRibGeometry,
  metrics,
  panelFaces,
  ribStrips,
  sideConsoles,
  upperTubes,
  useSciTextures,
  useScreenMaterials,
  useShapedMaterial,
  wallTubes,
} from './scifi';
import { CoreTower, CoreTowerLights } from './central/CoreTower';
import { BAY_CENTERS, BAY_LIGHT, COLLIDERS, CONSOLE_BAYS, DAIS, DOOR, FAR_Z, FOCUS, NEAR_Z, PROFILE, RIB, RIB_ZS, RING } from './central/layout';

export { FOCUS as CENTRAL_FOCUS };

const M = metrics(PROFILE);

/* ─────────────────────────────── 지오메트리 · 배치 (모듈 수준 상수) ─────────────────────────────── */

const OPENING = openingFor(DOOR);
/** 양 끝벽에 문 개구를 뚫는다 — 문짝이 올라가면 벽이 아니라 **문간**이 보이게 (scifi.Doorway) */
const END_WALL_GEO = makeEndWallGeometry(M, 6.4, OPENING);
const RIB_GEO = makeRibGeometry(M, RIB);
const UPPER = upperTubes(M, BAY_CENTERS);
const WALL = wallTubes(M, BAY_CENTERS);
const DATA = dataScreens(M, BAY_CENTERS);
const PANELS = panelFaces(M, BAY_CENTERS);
const STRIPS = ribStrips(M, RIB_ZS, RIB);
const CONSOLES = sideConsoles(M, CONSOLE_BAYS);

const RING_MODEL = { w: 0.894, h: 1 } as const;
const RING_FIT: Fit = { x: RING.thickness, y: RING_MODEL.h * RING.scale, z: RING_MODEL.w * RING.scale };
const RING_ITEMS: InstanceItem[] = [
  { position: [0, -RING.sink, FAR_Z + RING.thickness / 2], rotationY: Math.PI / 2 },
  { position: [0, -RING.sink, NEAR_Z - RING.thickness / 2], rotationY: Math.PI / 2 },
];
const DOOR_FIT: Fit = { x: DOOR.depth, y: DOOR.h, z: DOOR.w };
const NEAR_DOOR_ITEMS: InstanceItem[] = [{ position: [0, 0, NEAR_Z - DOOR.depth / 2 - 0.02], rotationY: Math.PI / 2 }];
const FAR_DOOR_ITEMS: InstanceItem[] = [{ position: [0, 0, FAR_Z + DOOR.depth / 2 + 0.02], rotationY: -Math.PI / 2 }];
/** 문짝이 올라가는 속도 (m/s) — 복도 격납문과 같다 */
const DOOR_OPEN_SPEED = 1.1;

/** 먼 끝 격납문 = 인지 검증실. 챕터 2 가 doors.centralFar 를 올리면 문짝이 천장으로 올라간다 (복도 FarDoor 와 같은 방식) */
function FarDoor({ material }: { material: THREE.Material }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const targetY = doors.get().centralFar * (DOOR.h + 0.2);
    if (Math.abs(g.position.y - targetY) < 1e-3) return;
    g.position.y += Math.sign(targetY - g.position.y) * Math.min(Math.abs(targetY - g.position.y), DOOR_OPEN_SPEED * Math.min(delta, 0.1));
  });
  return (
    <group ref={group}>
      <Parts id="sci_blast_door" fit={DOOR_FIT} items={FAR_DOOR_ITEMS} material={material} />
    </group>
  );
}

/* ─────────────────────────────── 건물 ─────────────────────────────── */

export interface CentralProps {
  quality?: QualityTier;
}

export function Central(_props: CentralProps) {
  const tex = useSciTextures();
  const screenMats = useScreenMaterials(tex.console);
  const consoleMat = useShapedMaterial('sci_console');
  const ringMat = useShapedMaterial('sci_bulkhead');
  const doorMat = useShapedMaterial('sci_blast_door');

  return (
    <group name="중앙 시설">
      <Shell m={M} tex={tex} endWall={END_WALL_GEO} />
      <RibRun geometry={RIB_GEO} zs={RIB_ZS} />
      <WallKit upper={UPPER} wall={WALL} screens={DATA} panels={PANELS} strips={STRIPS} consoles={CONSOLES} consoleMaterial={consoleMat} screenMaterials={screenMats} />

      <CoreTower center={DAIS} ceilingY={M.ceilingY} />

      {/* 문 뒤의 어두운 문간 — 검증실 문이 올라가면 강판 벽이 아니라 **안쪽**이 보인다 (2026-08-30 사용자) */}
      <Doorway z={FAR_Z} dir={-1} opening={OPENING} />
      <Doorway z={NEAR_Z} dir={1} opening={OPENING} />
      <Parts id="sci_bulkhead" fit={RING_FIT} items={RING_ITEMS} material={ringMat} />
      <Parts id="sci_blast_door" fit={DOOR_FIT} items={NEAR_DOOR_ITEMS} material={doorMat} />
      <FarDoor material={doorMat} />
    </group>
  );
}

/* ─────────────────────────────── 조명 ─────────────────────────────── */

/** bay 점광원 7 · 코어 위아래 2 = 9. 그림자·깜빡임 없음 */
export function CentralLights(_props: { flicker: boolean }) {
  return (
    <>
      <hemisphereLight args={['#a4b6cf', '#2a313c', 1.5]} />
      {BAY_CENTERS.map((z) => (
        <pointLight key={z} position={[0, BAY_LIGHT.y, z]} intensity={BAY_LIGHT.intensity} distance={BAY_LIGHT.distance} decay={1.7} color="#9cc3ff" />
      ))}
      <CoreTowerLights center={DAIS} ceilingY={M.ceilingY} />
    </>
  );
}

/* ─────────────────────────────── 충돌 ─────────────────────────────── */

export function resolveCentralColliders(p: THREE.Vector3, feetY: number) {
  const out = resolveCollisions(p.x, p.z, feetY, undefined, COLLIDERS);
  p.x = out.x;
  p.z = out.z;
}

export function centralGroundHeightAt(x: number, z: number, fromY: number): number {
  return groundHeightWith(x, z, fromY, COLLIDERS);
}
