/**
 * 격납고 홀 (창고 맵, /warehouse) — 3D 월드의 두 번째 배경. 2026-08-29 참고 이미지대로 재구성 (이전 널판 창고를 갈아엎었다).
 *
 * 참고 이미지: 복도와 같은 남색 강판의 8각 홀. 굵은 리브, 옆벽 콘솔·세로 튜브·상부 튜브. 끝벽엔 8각 관찰창(유리 너머 관제실)과
 * 양옆 모니터 2×2, 그 아래 앞이 깎인 8각 무대(앞 계단, 앞면 발광 띠, 윗면 원형 표식), 무대 위 천장에서 내려온 링 조명. 등 뒤 벽엔 격납문.
 *
 * 2026-09-02 에 **바닥·천장·등 뒤 벽을 채웠다.** 여태 물건이 전부 옆벽과 끝벽에 붙어 있어서, 판이 벌어지는 홀 한가운데가
 * 24×32m 빈 바닥이었다: 바닥에 화물 컨테이너 6더미(리더가 가리킬 물건이 된다 — lab/objects.ts), 천장에 갠트리 크레인 한 대,
 * 등 뒤 격납문 양옆에 충전 도크 4기, 그리고 홀을 도는 감시 드론 하나(이 맵에서 유일하게 움직이는 배경).
 *
 * 부품은 전부 map/scifi.tsx 의 공용 키트(셸·리브·튜브·콘솔·재질) — 복도와 같은 문법이다. 여기서 정하는 건 치수(warehouse/layout.ts)와
 * **끝벽 내용**(관찰창·모니터·무대·링 조명)이다. 텍스처는 복도 강판 5장 + 심문소의 관제실·모니터 화면 2장을 그대로 쓴다.
 * GLB: 벽 콘솔·격벽 링·격납문(복도 부품)·링 조명(심문소 부품)·화물 컨테이너·크레인 호이스트·충전 도크·감시 드론
 *       (뒤 넷은 이 맵 전용 — tools/warehouse-parts.json → tripo-studio-parts.sh → warehouse-glb.sh). 전부 알베도는 버리고 노멀맵만 쓴다.
 *   - 실제 광원은 Lights 가 12개 쥔다. 블룸·깜빡임·반사는 없다 (눈 아프다).
 *
 * 구조: 배치 배열은 **모듈 수준 상수** — 종류당 드로우콜 하나. 충돌 박스는 warehouse/layout.ts 의 COLLIDERS.
 * 여기에는 **씬만 있다.** 캔버스·카메라·이동·네트워크는 scene/WorldScene.tsx 가 쥔다. 맵 선택은 map/index.ts 의 MAPS.
 */

import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { groundHeightAt as groundHeightWith, resolveCollisions } from '../mp/collide';
import { doors } from '../mp/doors';
import type { QualityTier } from '../perf/quality';
import { GlbPart, type Fit, type InstanceItem } from './corridor/part';
import { Instanced, Parts, type Item } from './parts';
import {
  RibRun,
  STEEL_MAT,
  Shell,
  TUBE_MAT,
  WARM_MAT,
  WallKit,
  chamferedRect,
  dataScreens,
  hdr,
  makeEndWallGeometry,
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
import {
  BAY_CENTERS,
  BAY_LIGHT,
  BEAM,
  CARGO,
  CARGOS,
  COLLIDERS,
  CRANE,
  CONSOLE_BAYS,
  DOCK,
  DOCK_XS,
  DOOR,
  ARM,
  DRONE,
  FAN,
  END_LIGHT,
  END_WALL_TILE,
  FAR_Z,
  FOCUS,
  MID_Z,
  NEAR_Z,
  PROFILE,
  WALL_X,
  RIB,
  RIB_ZS,
  RING,
  RING_LAMP,
  SCREENS,
  STAGE,
  STAGE_FRONT_Z,
  STAGE_MARK,
  STAGE_SPOT,
  STAGE_STRIP,
  STAGE_Z,
  STEPS,
  WINDOW,
  cargoFootprint,
  type CargoPlace,
} from './warehouse/layout';

export { FOCUS as WAREHOUSE_FOCUS };

const M = metrics(PROFILE);

/** 관제실(유리 너머)·모니터 화면 2종 — 힉스필드 Seedream (2026-08-29), public/textures/warehouse/ */
const TEX = { window: '/textures/warehouse/control_room.webp', monitorA: '/textures/warehouse/monitor_a.webp', monitorB: '/textures/warehouse/monitor_b.webp' } as const;
useTexture.preload([TEX.window, TEX.monitorA, TEX.monitorB]);

/* ─────────────────────────────── 재질 ─────────────────────────────── */

/** 무대 — 리브보다 조금 밝은 무광 강철 */
const STAGE_MAT = new THREE.MeshStandardMaterial({ color: '#333d4b', roughness: 0.6, metalness: 0.45 });
const STEP_MAT = new THREE.MeshStandardMaterial({ color: '#2c3542', roughness: 0.6, metalness: 0.45 });
/** 무대 윗면 원반 — 어두운 청색 무광 */
const MARK_MAT = new THREE.MeshStandardMaterial({ color: '#1c2634', roughness: 0.7, metalness: 0.3 });
/** 무대 앞면·계단 발광 띠 · 윗면 링 · 링 조명 발광 테 — 튜브와 같은 등급 */
const STAGE_GLOW_MAT = TUBE_MAT;
/** 관찰창 프레임 안쪽 립 — 조금 밝은 강철 */
const LIP_MAT = new THREE.MeshStandardMaterial({ color: '#5a6676', roughness: 0.5, metalness: 0.6 });
/** 링 조명 봉 */
const ROD_MAT = STEEL_MAT;
/** 링 조명의 빛기둥 — 가산 혼합의 반투명 원뿔 (참고 이미지의 부드러운 광선). 아주 옅어 눈부시지 않다 */
const BEAM_MAT = new THREE.MeshBasicMaterial({ color: '#9fc4ee', transparent: true, opacity: BEAM.opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
/** 모니터 지지 기둥·브래킷 — 조금 밝은 강철 */
const POST_MAT = new THREE.MeshStandardMaterial({ color: '#3a4553', roughness: 0.55, metalness: 0.5 });

/* ─────────────────────────────── 지오메트리 · 배치 (모듈 수준 상수) ─────────────────────────────── */

const END_WALL_GEO = makeEndWallGeometry(M, END_WALL_TILE);
const RIB_GEO = makeRibGeometry(M, RIB);

const UPPER = upperTubes(M, BAY_CENTERS);
const WALL = wallTubes(M, BAY_CENTERS);
const DATA = dataScreens(M, BAY_CENTERS);
const PANELS = panelFaces(M, BAY_CENTERS);
const STRIPS = ribStrips(M, RIB_ZS, RIB);
const CONSOLES = sideConsoles(M, CONSOLE_BAYS);

/* ── 무대 — 앞 두 모서리를 깎은 판을 위로 압출. shape 의 y 가 −z 다 (x 축으로 −90° 돌리므로) ── */
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

/** 계단 3단 — 낮은 단이 앞. 윗면 = rise × (n − i) */
const STEP_ITEMS: Item[] = Array.from({ length: STEPS.n }, (_, i): Item => {
  const top = STEPS.rise * (STEPS.n - i);
  return { position: [0, top / 2, STAGE_FRONT_Z + STEPS.run * (i + 0.5)], scale: [STEPS.w, top, STEPS.run] };
});

/** 무대 앞면 발광 띠 — 계단 양옆의 곧은 면 + 깎인 모서리 면 + 계단 앞면 */
const STAGE_STRIPS: Item[] = (() => {
  const items: Item[] = [];
  const hw = STAGE.w / 2;
  const c = STAGE.chamfer;
  const z = STAGE_FRONT_Z + STAGE_STRIP.d / 2 + 0.01;
  const inner = STEPS.w / 2 + 0.25;
  const outer = hw - c - 0.15;
  for (const s of [-1, 1]) {
    items.push({ position: [s * ((inner + outer) / 2), STAGE_STRIP.y, z], scale: [outer - inner, STAGE_STRIP.h, STAGE_STRIP.d] });
    // 깎인 모서리 면 — 45°. 면 가운데는 (hw − c/2, front + c/2)
    const len = c * Math.SQRT2 - 0.3;
    items.push({ position: [s * (hw - c / 2 + 0.02), STAGE_STRIP.y, STAGE_FRONT_Z + c / 2 + 0.02], scale: [len, STAGE_STRIP.h, STAGE_STRIP.d], rotation: [0, s * Math.PI / 4, 0] });
  }
  for (let i = 0; i < STEPS.n; i++) {
    const top = STEPS.rise * (STEPS.n - i);
    items.push({ position: [0, top - 0.09, STAGE_FRONT_Z + STEPS.run * (i + 1) + 0.02], scale: [STEPS.w - 0.6, 0.04, 0.03] });
  }
  return items;
})();

/* ── 링 조명 (심문소 GLB) — 무대 중앙 위. 모델은 링이 아래·봉이 위, 발밑 = 링 밑면 ── */
const RING_LAMP_FIT: Fit = { x: RING_LAMP.dia };
const RING_LAMP_ITEMS: InstanceItem[] = [{ position: [0, RING_LAMP.y, STAGE_Z] }];

/* ── 관찰창 — 두 단 8각 프레임(바깥 두꺼운 테 + 한 단 들어간 안쪽 테) · 립 · 깊이 매립된 유리 ── */
/** 8각 테 하나 — 바깥 w×h 에서 안쪽 (w−2t)×(h−2t) 를 뺀 판을 depth 만큼 압출, 모서리 베벨 */
function ringGeometry(w: number, h: number, chamfer: number, t: number, depth: number, bevel: number): THREE.ExtrudeGeometry {
  const outer = chamferedRect(w, h, chamfer);
  outer.holes.push(chamferedRect(w - t * 2, h - t * 2, Math.max(0.05, chamfer - t * 0.6)));
  const g = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 });
  g.computeVertexNormals();
  return g;
}
const WIN_OUTER_W = WINDOW.w + WINDOW.frame * 2;
const WIN_OUTER_H = WINDOW.h + WINDOW.frame * 2;
/** 바깥 테 — 폭 frame − step, 벽에서 depth 돌출 */
const WINDOW_FRAME_GEO = ringGeometry(WIN_OUTER_W, WIN_OUTER_H, WINDOW.chamfer + WINDOW.frame * 0.5, WINDOW.frame - WINDOW.step, WINDOW.depth, 0.05);
/** 안쪽 테 — 바깥 테 안에서 step 만큼 더 들어가 개구까지, 돌출은 절반 (단이 진다) */
const WINDOW_STEP_GEO = ringGeometry(WINDOW.w + WINDOW.step * 2, WINDOW.h + WINDOW.step * 2, WINDOW.chamfer + WINDOW.step * 0.5, WINDOW.step, WINDOW.depth * 0.55, 0.03);
/** 유리 둘레의 얇은 밝은 립 — 유리 바로 앞 */
const WINDOW_LIP_GEO = ringGeometry(WINDOW.w + 0.1, WINDOW.h + 0.1, WINDOW.chamfer + 0.04, 0.06, 0.05, 0);
/** 유리 — ShapeGeometry 의 UV 는 월드 좌표라 바운딩 박스 기준 0~1 로 다시 편다 */
const WINDOW_GLASS_GEO = (() => {
  const g = new THREE.ShapeGeometry(chamferedRect(WINDOW.w, WINDOW.h, WINDOW.chamfer));
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / WINDOW.w + 0.5, pos.getY(i) / WINDOW.h + 0.5);
  uv.needsUpdate = true;
  return g;
})();

/* ── 모니터 2×2 × 양쪽 — 세로 지지 기둥 + 브래킷 + 베젤(검정 상자) + 화면(텍스처 상자, 왼쪽 열 A · 오른쪽 열 B) ── */
interface MonitorSpot {
  x: number;
  y: number;
  /** 클러스터 안의 열 — 0 왼쪽, 1 오른쪽 (텍스처가 다르다) */
  col: number;
}
const MONITORS: MonitorSpot[] = [-1, 1].flatMap((s) =>
  [0, 1].flatMap((col) => [-1, 1].map((cy): MonitorSpot => ({ x: s * SCREENS.cx + ((col === 0 ? -1 : 1) * (SCREENS.w + SCREENS.gapX)) / 2, y: SCREENS.y + (cy * (SCREENS.h + SCREENS.gapY)) / 2, col }))),
);
const POST_Z = FAR_Z + SCREENS.post.d / 2;
const BEZEL_D = 0.14;
const BEZEL_Z = FAR_Z + SCREENS.post.d + BEZEL_D / 2;
const CLUSTER_H = SCREENS.h * 2 + SCREENS.gapY + 0.7;
/** 클러스터마다 세로 기둥 하나(두 열 사이) + 위아래 짧은 가로 브래킷 */
const MONITOR_POSTS: Item[] = [-1, 1].flatMap((s): Item[] => [
  { position: [s * SCREENS.cx, SCREENS.y, POST_Z], scale: [SCREENS.post.w, CLUSTER_H, SCREENS.post.d] },
  { position: [s * SCREENS.cx, SCREENS.y + (SCREENS.h + SCREENS.gapY) / 2, POST_Z], scale: [SCREENS.w * 2 + SCREENS.gapX, 0.12, SCREENS.post.d * 0.8] },
  { position: [s * SCREENS.cx, SCREENS.y - (SCREENS.h + SCREENS.gapY) / 2, POST_Z], scale: [SCREENS.w * 2 + SCREENS.gapX, 0.12, SCREENS.post.d * 0.8] },
]);
const MONITOR_BEZELS: Item[] = MONITORS.map((c): Item => ({ position: [c.x, c.y, BEZEL_Z], scale: [SCREENS.w + 0.14, SCREENS.h + 0.14, BEZEL_D] }));
/** 화면은 베젤 앞면보다 1cm 앞 — 같은 면이면 z-fighting */
const monitorScreens = (col: number): Item[] => MONITORS.filter((c) => c.col === col).map((c): Item => ({ position: [c.x, c.y, BEZEL_Z + BEZEL_D / 2 + 0.01], scale: [SCREENS.w, SCREENS.h, 0.02] }));
const MONITOR_SCREENS_A = monitorScreens(0);
const MONITOR_SCREENS_B = monitorScreens(1);

/* ── 등 뒤 벽 — 격벽 링 + 격납문 (복도와 같은 부품) ── */
const RING_MODEL = { w: 0.894, h: 1 } as const;
const RING_FIT: Fit = { x: RING.thickness, y: RING_MODEL.h * RING.scale, z: RING_MODEL.w * RING.scale };
const RING_ITEMS: InstanceItem[] = [{ position: [0, -RING.sink, NEAR_Z - RING.thickness / 2], rotationY: Math.PI / 2 }];
const DOOR_FIT: Fit = { x: DOOR.depth, y: DOOR.h, z: DOOR.w };
const DOOR_ITEMS: InstanceItem[] = [{ position: [0, 0, NEAR_Z - DOOR.depth / 2 - 0.02], rotationY: Math.PI / 2 }];
/** 복도·중앙 시설·재검실의 문과 같은 속도 — 시설의 문은 다 같은 문이다 */
const DOOR_OPEN_SPEED = 1.1;

/**
 * 등 뒤 격납문 — **들어온 문이다.** 다른 맵의 문과 방향이 반대라서, 열린 채로 시작해 닫힌다
 * (world/mp/doors 의 hall). 이야기로 검증실에 들어올 때만 움직이고, /warehouse 로 그냥 열면
 * hall 이 0 이라 여태처럼 닫힌 문이다 — 그때는 이 컴포넌트가 아무 일도 안 한다.
 */
function HallDoor({ material }: { material: THREE.Material }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const targetY = doors.get().hall * (DOOR.h + 0.2);
    if (Math.abs(g.position.y - targetY) < 1e-3) return;
    g.position.y += Math.sign(targetY - g.position.y) * Math.min(Math.abs(targetY - g.position.y), DOOR_OPEN_SPEED * Math.min(delta, 0.1));
  });
  /*
   * 첫 프레임부터 제자리에 둔다 — 열린 채로 들어오는 길에서 문짝이 바닥에서 솟아오르며
   * 열리면, 들어서기도 전에 닫혔다 열리는 문을 보게 된다.
   */
  return (
    <group ref={group} position={[0, doors.get().hall * (DOOR.h + 0.2), 0]}>
      <Parts id="sci_blast_door" fit={DOOR_FIT} items={DOOR_ITEMS} material={material} />
    </group>
  );
}

/* ── 화물 컨테이너 (심문소 metal_case GLB 를 키워 쌓는다) ── */

/**
 * 컨테이너 한 칸 = 2.4 × 0.9 × 1.6m. 모델(x 1 · y 0.54 · z 0.7)을 축마다 따로 늘려 상자꼴로 만든다 —
 * 비율을 지키면 납작한 케이스 그대로라 컨테이너로 안 읽힌다. 자리·단수·높이는 warehouse/layout.ts.
 */
const CARGO_FIT: Fit = { x: CARGO.w, y: CARGO.h, z: CARGO.d };
/** 위로 갈수록 조금씩 작아지고 한 단씩 뒤집힌다 — 같은 상자를 정확히 포개면 복사한 티가 난다 */
const CARGO_ITEMS: InstanceItem[] = CARGOS.flatMap((c) =>
  Array.from({ length: c.stack }, (_, i): InstanceItem => {
    const shrink = 1 - i * 0.04;
    return {
      position: [c.x, CARGO.h * i, c.z],
      rotationY: (c.dir === 'z' ? Math.PI / 2 : 0) + (i % 2 ? Math.PI : 0),
      scale: [shrink, 1, shrink],
    };
  }),
);

/**
 * 컨테이너 발광 띠 — **무대 발광 띠와 같은 생각이다**: 무광 바닥에서 턱이 안 읽히면 헛디딘다.
 * 밑단 둘레의 띠는 어둠 속에서 상자를 드러내고, 1단짜리에만 두르는 윗면 테는 「여기 올라선다」를 말한다
 * (그 둘만 올라설 수 있다 — lab/objects.ts 의 MOUNT_LIMIT).
 */
const CARGO_STRIP = { h: 0.05, d: 0.03, y: 0.44 } as const;
function cargoBand(c: CargoPlace, y: number, inset: number): Item[] {
  const { hw, hd } = cargoFootprint(c);
  return [
    ...[-1, 1].map((s): Item => ({ position: [c.x, y, c.z + s * (hd - inset)], scale: [hw * 2 - inset * 4, CARGO_STRIP.h, CARGO_STRIP.d] })),
    ...[-1, 1].map((s): Item => ({ position: [c.x + s * (hw - inset), y, c.z], scale: [CARGO_STRIP.d, CARGO_STRIP.h, hd * 2 - inset * 4] })),
  ];
}
const CARGO_STRIPS: Item[] = [
  ...CARGOS.flatMap((c) => cargoBand(c, CARGO_STRIP.y, 0.02)),
  // 올라설 수 있는 것만 윗면 가장자리에 테를 두른다
  ...CARGOS.filter((c) => c.stack === 1).flatMap((c) => cargoBand(c, CARGO.h + 0.01, 0.06)),
];

/* ── 천장 갠트리 크레인 (레일·거더는 상자, 호이스트만 GLB) ── */

const CRANE_STEEL: Item[] = [
  // 레일 두 줄 — 옆벽 위를 길이 방향으로
  ...[-1, 1].map((s): Item => ({ position: [s * CRANE.railX, CRANE.railY, MID_Z], scale: [CRANE.railW, CRANE.railW, NEAR_Z - FAR_Z] })),
  // 가로 거더 + 양 끝 대차
  { position: [0, CRANE.girderY, CRANE.z], scale: [CRANE.girderHalfW * 2, CRANE.girderH, CRANE.girderD] },
  ...[-1, 1].map((s): Item => ({ position: [s * CRANE.girderHalfW, CRANE.railY + CRANE.truckH / 2, CRANE.z], scale: [CRANE.truckW, CRANE.truckH, CRANE.truckW] })),
];
/**
 * 크레인 발광 띠 — **이 홀의 실제 광원 8개는 한가운데 줄(x 0)에만 있다.** 옆벽·천장에 놓은 것은
 * 그 빛이 안 닿아 검은 덩어리가 된다. 이 맵이 원래 쓰는 수(LED 띠)로 형체를 그린다.
 * 거더 양 옆면에 한 줄씩 + 레일 윗면에 한 줄씩.
 */
const CRANE_STRIPS: Item[] = [
  ...[-1, 1].map((s): Item => ({ position: [0, CRANE.girderY, CRANE.z + s * (CRANE.girderD / 2 + 0.02)], scale: [CRANE.girderHalfW * 2 - 1.2, 0.05, 0.03] })),
  ...[-1, 1].map((s): Item => ({ position: [s * CRANE.railX, CRANE.railY + CRANE.railW / 2 + 0.02, MID_Z], scale: [0.05, 0.03, NEAR_Z - FAR_Z - 1] })),
];
/** 대차의 주황 표시등 — 랙 표시등과 같은 생각 (기계는 켜져 있다) */
const CRANE_DOTS: Item[] = [-1, 1].map((s): Item => ({ position: [s * CRANE.girderHalfW, CRANE.railY + CRANE.truckH / 2, CRANE.z - CRANE.truckW / 2 - 0.02], scale: [0.14, 0.09, 0.03] }));
const HOIST_FIT: Fit = { y: CRANE.hoistH };
const HOIST_ITEMS: InstanceItem[] = [{ position: [CRANE.hoistX, CRANE.hoistY, CRANE.z] }];

/* ── 등 뒤 벽 충전 도크 ── */

const DOCK_FIT: Fit = { x: DOCK.w, y: DOCK.h, z: DOCK.depth };
/** 벽에 등을 대고 홀 쪽(−z)을 본다 */
const DOCK_ITEMS: InstanceItem[] = DOCK_XS.map((x): InstanceItem => ({ position: [x, 0, NEAR_Z - DOCK.depth], rotationY: Math.PI }));
/** 도크의 세로 발광 채널 둘 + 발판 앞 띠 — 빈 자리라는 표시. 등 뒤 벽은 광원이 하나도 없어 이것만이 형체를 그린다 */
const DOCK_FRONT_Z = NEAR_Z - DOCK.depth - 0.03;
const DOCK_STRIPS: Item[] = DOCK_XS.flatMap((x): Item[] => [
  ...[-1, 1].map((s): Item => ({ position: [x + s * DOCK.w * 0.3, DOCK.h * 0.56, DOCK_FRONT_Z], scale: [0.05, DOCK.h * 0.66, 0.03] })),
  { position: [x, 0.1, DOCK_FRONT_Z + 0.06], scale: [DOCK.w * 0.8, 0.04, 0.03] },
]);
/** 도크 위쪽 호박색 표시등 */
const DOCK_DOTS: Item[] = DOCK_XS.map((x): Item => ({ position: [x, DOCK.h * 0.94, DOCK_FRONT_Z], scale: [0.12, 0.08, 0.03] }));

/* ── 감시 드론 ── */

const DRONE_FIT: Fit = { x: DRONE.size };

/* ── 옆벽 배기 팬 · 검사 암 ── */

/** 팬은 원판이라 지름 하나로 맞춘다 (모델은 xy 평면의 원판, 두께가 z) */
const FAN_FIT: Fit = { x: FAN.dia };
/** 암은 길이가 z 축이다 — 벽판이 −z, 머리가 +z (tools 로 재어 확인) */
const ARM_FIT: Fit = { z: ARM.len };
/** 암 머리의 렌즈 — 드론과 같은 손이되 색은 이 방의 청록이다 (검사 장치는 붉지 않다) */
const ARM_LENS_MAT = new THREE.MeshBasicMaterial({ color: hdr('#6fd3ff', 1.2), toneMapped: false });
/** 벽에 걸리는 자리 — 왼벽은 +x 로, 오른벽은 −x 로 뻗는다. 부호가 곧 회전 방향이다 */
const SIDES = [-1, 1] as const;
/** 렌즈 — 알베도를 뗀 몸에서 여기만 빛난다 (광원은 안 준다, 이 맵의 광원 12개는 정해진 예산이다) */
const LENS_MAT = new THREE.MeshBasicMaterial({ color: hdr('#ff8a4a', 1.3), toneMapped: false });

/* ─────────────────────────────── 건물 ─────────────────────────────── */

export interface WarehouseProps {
  /** 품질 단계 — 반사·블룸이 없는 맵이라 쓰지 않는다 (MapDef.Scene 의 시그니처) */
  quality?: QualityTier;
}

/** 8각 셸 · 리브 · 벽 장식 한 벌 · 끝벽(관찰창·모니터·무대·링 조명) · 등 뒤 격납문 */
export function Warehouse(_props: WarehouseProps) {
  const tex = useSciTextures();
  const [windowTex, monitorA, monitorB] = useTexture([TEX.window, TEX.monitorA, TEX.monitorB]);
  const screenMats = useScreenMaterials(tex.console);
  const consoleMat = useShapedMaterial('sci_console');
  const ringMat = useShapedMaterial('sci_bulkhead');
  const doorMat = useShapedMaterial('sci_blast_door');
  const lampMat = useShapedMaterial('ring_lamp');
  const cargoMat = useShapedMaterial('cargo_container');
  const hoistMat = useShapedMaterial('crane_hoist');
  const dockMat = useShapedMaterial('charge_dock');
  const droneMat = useShapedMaterial('watch_drone');
  const fanMat = useShapedMaterial('hall_fan');
  const armMat = useShapedMaterial('wall_arm');

  const endMats = useMemo(() => {
    const prep = (t: THREE.Texture) => {
      const c = t.clone();
      c.colorSpace = THREE.SRGBColorSpace;
      c.anisotropy = 8;
      c.needsUpdate = true;
      return c;
    };
    return {
      /** 유리 너머 관제실 — 조명을 안 받는 재질이라 점광원 하이라이트 얼룩이 없다. 배율 1 아래로 어둡게 */
      glass: new THREE.MeshBasicMaterial({ map: prep(windowTex), color: hdr('#c8d6e6', 0.8), toneMapped: false }),
      /** 모니터 — 조명 무관, 배율 1 아래 */
      monitorA: new THREE.MeshBasicMaterial({ map: prep(monitorA), color: hdr('#d0e0f4', 0.72), toneMapped: false }),
      monitorB: new THREE.MeshBasicMaterial({ map: prep(monitorB), color: hdr('#d0e0f4', 0.72), toneMapped: false }),
    };
  }, [windowTex, monitorA, monitorB]);

  return (
    <group name="격납고 홀">
      <Shell m={M} tex={tex} endWall={END_WALL_GEO} />
      <RibRun geometry={RIB_GEO} zs={RIB_ZS} />
      <WallKit upper={UPPER} wall={WALL} screens={DATA} panels={PANELS} strips={STRIPS} consoles={CONSOLES} consoleMaterial={consoleMat} screenMaterials={screenMats} />

      {/* 무대 · 계단 · 발광 띠 · 윗면 표식 */}
      <group name="무대">
        <mesh name="무대턱" geometry={STAGE_GEO} material={STAGE_MAT} />
        <Instanced name="계단" items={STEP_ITEMS} material={STEP_MAT} />
        <Instanced name="무대 발광 띠" items={STAGE_STRIPS} material={STAGE_GLOW_MAT} receiveShadow={false} />
        <mesh name="무대 표식" rotation-x={-Math.PI / 2} position={[0, STAGE.h + 0.006, STAGE_Z]} material={MARK_MAT}>
          <circleGeometry args={[STAGE_MARK.r, 48]} />
        </mesh>
        <mesh name="무대 표식 링" rotation-x={-Math.PI / 2} position={[0, STAGE.h + 0.012, STAGE_Z]} material={STAGE_GLOW_MAT}>
          <ringGeometry args={[STAGE_MARK.r - STAGE_MARK.ring, STAGE_MARK.r, 64]} />
        </mesh>
      </group>

      {/* 링 조명 — 기구(GLB) + 밑면 발광 테 + 천장까지 봉 */}
      <group name="링 조명">
        <Parts id="ring_lamp" fit={RING_LAMP_FIT} items={RING_LAMP_ITEMS} material={lampMat} receiveShadow={false} />
        <mesh position={[0, RING_LAMP.y - 0.01, STAGE_Z]} rotation-x={Math.PI / 2} material={STAGE_GLOW_MAT}>
          <torusGeometry args={[RING_LAMP.dia * 0.4, 0.05, 8, 48]} />
        </mesh>
        <mesh position={[0, (RING_LAMP.y + 0.6 + M.ceilingY) / 2, STAGE_Z]} material={ROD_MAT}>
          <cylinderGeometry args={[0.07, 0.07, M.ceilingY - RING_LAMP.y - 0.6, 12]} />
        </mesh>
        <mesh name="빛기둥" position={[0, (RING_LAMP.y - 0.1 + STAGE.h) / 2, STAGE_Z]} material={BEAM_MAT} renderOrder={10}>
          <cylinderGeometry args={[BEAM.topR, BEAM.bottomR, RING_LAMP.y - 0.1 - STAGE.h, 32, 1, true]} />
        </mesh>
      </group>

      {/* 관찰창 · 모니터 */}
      <group name="관찰창" position={[0, WINDOW.y, FAR_Z + 0.02]}>
        <mesh geometry={WINDOW_FRAME_GEO} material={STEEL_MAT} />
        <mesh geometry={WINDOW_STEP_GEO} material={STEEL_MAT} />
        <mesh geometry={WINDOW_LIP_GEO} material={LIP_MAT} position={[0, 0, 0.08]} />
        {/* 유리는 프레임 깊숙이(벽 쪽) — 두 단 테가 그늘을 만들어 창이 깊어 보인다 */}
        <mesh name="유리" geometry={WINDOW_GLASS_GEO} material={endMats.glass} position={[0, 0, 0.07]} />
      </group>
      <Instanced name="모니터 기둥" items={MONITOR_POSTS} material={POST_MAT} />
      <Instanced name="모니터 베젤" items={MONITOR_BEZELS} material={STEEL_MAT} />
      <Instanced name="모니터 A" items={MONITOR_SCREENS_A} material={endMats.monitorA} receiveShadow={false} />
      <Instanced name="모니터 B" items={MONITOR_SCREENS_B} material={endMats.monitorB} receiveShadow={false} />

      {/* 등 뒤 — 격벽 링 + 격납문 */}
      <Parts id="sci_bulkhead" fit={RING_FIT} items={RING_ITEMS} material={ringMat} />
      <HallDoor material={doorMat} />

      {/* 바닥의 화물 컨테이너 — 리더가 홀 한가운데를 가리킬 물건 (lab/objects.ts 의 카탈로그로 들어간다) */}
      <Parts id="cargo_container" fit={CARGO_FIT} items={CARGO_ITEMS} material={cargoMat} />
      <Instanced name="컨테이너 띠" items={CARGO_STRIPS} material={STAGE_GLOW_MAT} receiveShadow={false} />

      {/* 천장 갠트리 크레인 — 레일·거더·대차는 상자, 매달린 호이스트만 GLB */}
      <group name="갠트리 크레인">
        <Instanced name="크레인 강재" items={CRANE_STEEL} material={STEEL_MAT} />
        <Instanced name="크레인 띠" items={CRANE_STRIPS} material={STAGE_GLOW_MAT} receiveShadow={false} />
        <Instanced name="대차 표시등" items={CRANE_DOTS} material={WARM_MAT} receiveShadow={false} />
        <Parts id="crane_hoist" fit={HOIST_FIT} items={HOIST_ITEMS} material={hoistMat} />
      </group>

      {/* 등 뒤 벽 충전 도크 — 격납문 양옆 */}
      <Parts id="charge_dock" fit={DOCK_FIT} items={DOCK_ITEMS} material={dockMat} />
      <Instanced name="도크 채널" items={DOCK_STRIPS} material={STAGE_GLOW_MAT} receiveShadow={false} />
      <Instanced name="도크 표시등" items={DOCK_DOTS} material={WARM_MAT} receiveShadow={false} />

      {/* 옆벽에서 움직이는 것 둘 — 도는 팬과 훑는 암 (warehouse/layout 의 FAN · ARM) */}
      <HallFans material={fanMat} />
      <WallArms material={armMat} />

      <WatchDrone material={droneMat} />
    </group>
  );
}

/**
 * 옆벽의 배기 팬 넷 — **날개만 뽑은 모델이라 통째로 돈다.** 테는 원이라 돌아도 티가 안 나서
 * 그 자체가 정지한 보호망으로 읽힌다 (모델 하나로 도는 것과 안 도는 것을 같이 얻는다).
 *
 * 벽에 붙는 각도: 모델 원판의 법선이 +z 라, 왼벽(x −12)에서 방 안(+x)을 보게 하려면 y 로 +90° 돈다.
 * 그 뒤로는 **제 법선(로컬 z)** 을 축으로 돌리는 것이 곧 날개가 도는 것이다.
 */
function HallFans({ material }: { material: THREE.Material }) {
  const spin = useRef<THREE.Group[]>([]);
  useFrame((state) => {
    const a = (state.clock.elapsedTime / FAN.period) * Math.PI * 2;
    // 자리마다 조금씩 어긋나게 — 넷이 같은 날에 같이 서 있으면 한 대처럼 보인다
    spin.current.forEach((g, i) => g && (g.rotation.z = a + i * 1.1));
  });
  return (
    <group name="배기 팬">
      {SIDES.flatMap((side, si) =>
        FAN.zs.map((z, zi) => (
          <group
            key={`${side}:${z}`}
            position={[side * (WALL_X - FAN.gap), FAN.y, z]}
            rotation={[0, (side * -Math.PI) / 2, 0]}
          >
            <group ref={(g) => { if (g) spin.current[si * FAN.zs.length + zi] = g; }}>
              <GlbPart id="hall_fan" fit={FAN_FIT} material={material} />
            </group>
          </group>
        )),
      )}
    </group>
  );
}

/**
 * 옆벽의 검사 암 넷 — 벽판을 축으로 시계바늘처럼 좌우로 쓸어 본다.
 *
 * 모델은 마디가 하나로 붙어 있어 관절이 안 접힌다. 그런데 **벽판이 원이라** 그 축으로 돌리면
 * 관절 없이도 「훑는다」가 된다 — 팬의 테와 같은 수를 반대로 쓴 셈이다.
 * 벽판이 로컬 −z 라, 자리를 len/2 만큼 안쪽으로 당겨야 판이 벽면에 앉는다.
 */
function WallArms({ material }: { material: THREE.Material }) {
  const sweep = useRef<THREE.Group[]>([]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    sweep.current.forEach((g, i) => {
      if (!g) return;
      // 넷이 같은 박자로 흔들리면 기계가 아니라 장식이다 — 자리마다 위상을 어긋나게
      g.rotation.z = Math.sin((t / ARM.period + i * 0.37) * Math.PI * 2) * ARM.sweep;
    });
  });
  return (
    <group name="검사 암">
      {SIDES.flatMap((side, si) =>
        ARM.zs.map((z, zi) => (
          <group
            key={`${side}:${z}`}
            position={[side * (WALL_X - ARM.len / 2), ARM.y, z]}
            rotation={[0, (side * -Math.PI) / 2, 0]}
          >
            <group ref={(g) => { if (g) sweep.current[si * ARM.zs.length + zi] = g; }}>
              <GlbPart id="wall_arm" fit={ARM_FIT} material={material} />
              {/* 머리의 렌즈 — 모델 +z 끝이다 */}
              <mesh position={[0, 0.05, ARM.len * 0.44]} material={ARM_LENS_MAT}>
                <sphereGeometry args={[0.05, 10, 10]} />
              </mesh>
            </group>
          </group>
        )),
      )}
    </group>
  );
}

/**
 * 홀을 도는 감시 드론 — **이 맵에서 유일하게 움직이는 배경.** 격납고 홀은 통째로 정지해 있어서
 * 개체들이 말을 멈추면 화면이 사진이 됐다. 크레인 거더 위(y 6.6)를 천천히 한 바퀴 돈다.
 *
 * 코스·주기는 warehouse/layout.ts 의 DRONE. 광원은 안 달았다 — 렌즈만 발광 재질로 빛난다.
 */
function WatchDrone({ material }: { material: THREE.Material }) {
  const g = useRef<THREE.Group>(null);
  useFrame((state) => {
    const grp = g.current;
    if (!grp) return;
    const a = (state.clock.elapsedTime / DRONE.period) * Math.PI * 2;
    grp.position.set(Math.cos(a) * DRONE.r, DRONE.y + Math.sin(a * 3) * DRONE.bob, DRONE.cz + Math.sin(a) * DRONE.r);
    // 가는 쪽을 본다 — 둘레 접선 방향
    grp.rotation.y = -a + Math.PI / 2;
  });
  return (
    <group ref={g} name="감시 드론">
      {/* v3.1 부품은 발밑이 원점이다 — DRONE.y 가 곧 드론 밑면. 렌즈는 모델의 눈 자리에 얹는다 */}
      <GlbPart id="watch_drone" fit={DRONE_FIT} material={material} />
      <mesh position={[0, DRONE.size * 0.2, DRONE.size * 0.5]} material={LENS_MAT}>
        <sphereGeometry args={[0.07, 12, 12]} />
      </mesh>
    </group>
  );
}

/* ─────────────────────────────── 조명 ─────────────────────────────── */

/**
 * 실제 광원 12개 — bay 점광원 8 · 링 조명 스포트 1 · 끝벽(관찰창·모니터) 점광원 3. 그림자·깜빡임 없음.
 */
export function WarehouseLights(_props: { flicker: boolean }) {
  const spot = useRef<THREE.SpotLight>(null);
  const target = useRef<THREE.Object3D>(null);
  useLayoutEffect(() => {
    if (spot.current && target.current) spot.current.target = target.current;
  }, []);

  return (
    <>
      <hemisphereLight args={['#a4b6cf', '#2a313c', 1.5]} />
      {BAY_CENTERS.map((z) => (
        <pointLight key={z} position={[0, BAY_LIGHT.y, z]} intensity={BAY_LIGHT.intensity} distance={BAY_LIGHT.distance} decay={1.7} color="#9cc3ff" />
      ))}
      {/* 링 조명 → 무대 가운데 */}
      <object3D ref={target} position={[0, STAGE.h, STAGE_Z]} />
      <spotLight ref={spot} position={[0, RING_LAMP.y - 0.1, STAGE_Z]} angle={STAGE_SPOT.angle} penumbra={0.7} intensity={STAGE_SPOT.intensity} distance={STAGE_SPOT.distance} decay={1.6} color="#dfeeff" />
      {/* 관찰창·모니터 */}
      {[-SCREENS.cx, 0, SCREENS.cx].map((x) => (
        <pointLight key={x} position={[x, END_LIGHT.y, FAR_Z + END_LIGHT.off]} intensity={END_LIGHT.intensity} distance={END_LIGHT.distance} decay={1.7} color="#b9d4ff" />
      ))}
    </>
  );
}

/* ─────────────────────────────── 충돌 ─────────────────────────────── */

/** 충돌 데이터는 warehouse/layout.ts 의 COLLIDERS, 판정은 mp/collide.ts. 여기는 THREE.Vector3 를 제자리에서 고쳐 주는 껍데기다 */
export function resolveWarehouseColliders(p: THREE.Vector3, feetY: number) {
  const out = resolveCollisions(p.x, p.z, feetY, undefined, COLLIDERS);
  p.x = out.x;
  p.z = out.z;
}

export function warehouseGroundHeightAt(x: number, z: number, fromY: number): number {
  return groundHeightWith(x, z, fromY, COLLIDERS);
}
