/**
 * SF 우주선 복도 — 3D 월드의 배경 (2026-08-29 참고 이미지대로 재구성. 이전 Black & Gold 복도를 갈아엎었다).
 *
 * 참고 이미지: 어두운 남색 강판의 복도. 단면은 **8각**(수직 벽 위가 45° 로 꺾여 천장에 닿는다). 굵은 격벽 리브가 일정 간격으로 서고,
 * 리브 사이 패널에 청백색 발광 튜브가 세 단으로 박혀 있다 — 상부 경사면엔 가로, 벽엔 세로, 발치 콘솔 앞면엔 가로(+ 주황 표시등).
 * 바닥은 큰 강판(무광 — 반사는 눈 아파서 뺐다), 양쪽 가장자리에 격자 배수로. 복도 끝은 8각 엠블럼의 격납문을 격벽 링이 두른다. (2026-08-29 10×36m 로 넓힘)
 *
 * 부품은 전부 map/scifi.tsx 의 공용 키트(셸·리브·튜브·콘솔·재질) — 격납고 홀(warehouse.tsx)과 같은 문법이다. 여기서 정하는 건
 * 치수(corridor/layout.ts)와 **양 끝의 격벽 링 + 격납문**(Tripo, tools/corridor-sci-parts.json → tools/corridor-sci-glb.sh)뿐이다.
 *   - 리브는 절차 생성 — Tripo 링을 비균등 확대하면 45° 챔퍼가 무너져서다. 링은 균등 확대가 되는 끝벽의 문틀로만 쓴다.
 *   - 실제 광원은 Lights 가 11개만 쥔다. 블룸·깜빡임·반사는 전부 뺐다 (눈 아프다).
 *
 * 구조: 배치 배열은 **모듈 수준 상수** — 종류당 드로우콜 하나. 충돌 박스는 mp/collide.ts — layout 을 고치면 같이 고친다.
 * 여기에는 **씬만 있다.** 캔버스·카메라·이동·네트워크는 scene/WorldScene.tsx 가 쥔다.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

import { groundHeightAt, resolveCollisions } from '../mp/collide';
import { doors } from '../mp/doors';
import type { QualityTier } from '../perf/quality';
import type { Fit, InstanceItem } from './corridor/part';
import { BAY_CENTERS, BAY_LIGHT, CONSOLE_BAYS, DECOR_BAYS, DOOR, DOOR_LIGHT, FAR_Z, FOCUS, GAP, M, NEAR_Z, RIB, RIB_ZS, RING } from './corridor/layout';
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
  panelFaces,
  ribStrips,
  sideConsoles,
  upperTubes,
  useSciTextures,
  useScreenMaterials,
  useShapedMaterial,
  wallTubes,
} from './scifi';

export { FOCUS };

/* ─────────────────────────────── 지오메트리 · 배치 (모듈 수준 상수) ─────────────────────────────── */

const OPENING = openingFor(DOOR);
/** 양 끝벽에 문 개구를 뚫는다 — 문짝이 올라가면 벽이 아니라 **문간**이 보이게 (scifi.Doorway) */
const END_WALL_GEO = makeEndWallGeometry(M, undefined, OPENING);
const RIB_GEO = makeRibGeometry(M, RIB);

const UPPER = upperTubes(M, BAY_CENTERS);
// 벽 장식은 그림 bay(INSCRIPTION_BAY)를 비운다 — 챕터 1 의 "어떤 방" (벽의 크레용 그림이 크게 걸린다)
const WALL = wallTubes(M, DECOR_BAYS);
const SCREENS = dataScreens(M, DECOR_BAYS);
const PANELS = panelFaces(M, DECOR_BAYS);
const STRIPS = ribStrips(M, RIB_ZS, RIB);
const CONSOLES = sideConsoles(M, CONSOLE_BAYS);

/* ── 격벽 링 · 격납문 (GLB, 양 끝) ── */
/** Tripo 링 모델 치수 — 폭 0.894 · 높이 1 (두께 축 x 는 받침판까지 0.419). 균등 배율이어야 챔퍼가 45° 로 남는다 */
const RING_MODEL = { w: 0.894, h: 1 } as const;
const RING_FIT: Fit = { x: RING.thickness, y: RING_MODEL.h * RING.scale, z: RING_MODEL.w * RING.scale };
/** 링 평면은 모델의 YZ — y 로 π/2 돌려 끝벽에 세운다. 안쪽 바닥 가장자리가 복도 바닥에 오게 sink 만큼 내린다 */
const RING_ITEMS: InstanceItem[] = [
  { position: [0, -RING.sink, FAR_Z + RING.thickness / 2], rotationY: Math.PI / 2 },
  { position: [0, -RING.sink, NEAR_Z - RING.thickness / 2], rotationY: Math.PI / 2 },
];
const DOOR_FIT: Fit = { x: DOOR.depth, y: DOOR.h, z: DOOR.w };
/** 문 모델의 정면이 +x — 먼 끝벽은 +z 를 보게 −π/2, 가까운 끝벽은 +π/2. 먼 문은 열리므로(mp/doors.ts) 따로 그룹에 둔다 */
const NEAR_DOOR_ITEMS: InstanceItem[] = [{ position: [0, 0, NEAR_Z - DOOR.depth / 2 - GAP], rotationY: Math.PI / 2 }];
const FAR_DOOR_ITEMS: InstanceItem[] = [{ position: [0, 0, FAR_Z + DOOR.depth / 2 + GAP], rotationY: -Math.PI / 2 }];
/** 문이 열리는 속도(m/s) — 격납문이 천장 속으로 올라간다 */
const DOOR_OPEN_SPEED = 1.1;

/** 먼 끝 격납문 — 이야기가 열면(doors.corridorFar) 문짝이 위로 올라간다. 링은 그대로 */
function FarDoor({ material }: { material: THREE.Material }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const targetY = doors.get().corridorFar * (DOOR.h + 0.2);
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

export interface CorridorProps {
  /** 품질 단계 — 반사 바닥을 뺀 뒤로는 이 맵에서 쓰지 않는다 (MapDef.Scene 의 시그니처) */
  quality?: QualityTier;
}

/** 8각 셸 · 리브 · 벽 장식 한 벌 · 양 끝의 격벽 링 + 격납문 */
export function Corridor(_props: CorridorProps) {
  const tex = useSciTextures();
  const screenMats = useScreenMaterials(tex.console);
  const ringMat = useShapedMaterial('sci_bulkhead');
  const consoleMat = useShapedMaterial('sci_console');
  const doorMat = useShapedMaterial('sci_blast_door');

  return (
    <group name="복도">
      <Shell m={M} tex={tex} endWall={END_WALL_GEO} />
      <RibRun geometry={RIB_GEO} zs={RIB_ZS} />
      <WallKit upper={UPPER} wall={WALL} screens={SCREENS} panels={PANELS} strips={STRIPS} consoles={CONSOLES} consoleMaterial={consoleMat} screenMaterials={screenMats} />

      {/* 양 끝 — 격벽 링(Tripo)이 격납문(Tripo)을 두른다. 문 뒤에는 어두운 문간이 있다 (열려도 벽이 아니라 안쪽이 보인다) */}
      <Doorway z={FAR_Z} dir={-1} opening={OPENING} />
      <Doorway z={NEAR_Z} dir={1} opening={OPENING} />
      <Parts id="sci_bulkhead" fit={RING_FIT} items={RING_ITEMS} material={ringMat} />
      <Parts id="sci_blast_door" fit={DOOR_FIT} items={NEAR_DOOR_ITEMS} material={doorMat} />
      <FarDoor material={doorMat} />
    </group>
  );
}

/* ─────────────────────────────── 조명 ─────────────────────────────── */

/**
 * 실제 광원 11개 — bay 마다 차가운 점광원 9 · 양 끝 문 앞 점광원 2. 그림자를 굽는 광원은 없다.
 * flicker 는 이 맵에선 쓰지 않는다 — 3% 흔들림도 "반짝반짝 눈 아프다"였다 (2026-08-29).
 * 튜브 자체는 발광 재질이라 벽을 못 비춘다 — 점광원이 리브 베벨·강판 결에 형태를 준다.
 */
export function Lights(_props: { flicker: boolean }) {
  return (
    <>
      <hemisphereLight args={['#a4b6cf', '#2a313c', 1.5]} />
      {BAY_CENTERS.map((z) => (
        <pointLight key={z} position={[0, BAY_LIGHT.y, z]} intensity={BAY_LIGHT.intensity} distance={BAY_LIGHT.distance} decay={1.7} color="#9cc3ff" />
      ))}
      <pointLight position={[0, DOOR_LIGHT.y, FAR_Z + DOOR_LIGHT.off]} intensity={DOOR_LIGHT.intensity} distance={DOOR_LIGHT.distance} decay={1.7} color="#b9d4ff" />
      <pointLight position={[0, DOOR_LIGHT.y, NEAR_Z - DOOR_LIGHT.off]} intensity={DOOR_LIGHT.intensity} distance={DOOR_LIGHT.distance} decay={1.7} color="#b9d4ff" />
    </>
  );
}

/* ─────────────────────────────── 충돌 ─────────────────────────────── */

/** 충돌 데이터와 판정은 mp/collide.ts 하나에만 있다. 여기는 THREE.Vector3 를 제자리에서 고쳐 주는 껍데기다. */
export function resolveColliders(p: THREE.Vector3, feetY: number) {
  const out = resolveCollisions(p.x, p.z, feetY);
  p.x = out.x;
  p.z = out.z;
}

export { groundHeightAt };
