/**
 * SF 우주선 실내 **공용 부품 키트** — 복도(corridor.tsx)와 격납고 홀(warehouse.tsx)이 같이 쓴다.
 *
 * 둘 다 같은 문법이다: 8각 단면(수직 벽 위가 45° 로 꺾여 천장) 셸 · 굵은 격벽 리브 · 리브 사이 패널의 청백 튜브 세 단
 * (경사면 가로 · 벽 세로 · 발치 콘솔 가로) · 데이터 화면 · 콘솔 패널 면 · 강판 바닥과 격자 배수로. 다른 건 **치수와 끝벽 내용**뿐이라
 * 단면(Profile)을 받아 지오메트리·배치 배열을 만들어 주는 함수와, 그걸 그리는 컴포넌트를 여기 모았다.
 *
 * 규칙:
 *   - 재질은 모듈 수준에서 한 번 만들어 공유한다 (Instanced/Parts 가 그렇게 기대한다).
 *   - 배치 배열을 만드는 함수는 **맵 모듈 수준에서 한 번만** 부른다 — 렌더 안에서 부르면 참조가 바뀌어 행렬을 매번 다시 쓴다.
 *   - 반사·블룸·깜빡임·1 넘는 발광은 없다 — "눈 아프다"(2026-08-29). 전부 무광, 튜브는 배율 1 아래의 연한 하늘색.
 *   - Tripo 부품(콘솔·링·문)은 알베도·거칠기 맵을 떼고 노멀맵만 단색 강철에 얹는다 (useShapedMaterial) — 통째로 덮으면 형상이 죽는다.
 */

import { useTexture } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { usePartSource, type Fit, type InstanceItem } from './corridor/part';
import { Instanced, Parts, useTiled, type Item } from './parts';

/* ─────────────────────────────── 단면 ─────────────────────────────── */

export type Side = -1 | 1;
export const SIDES: readonly Side[] = [-1, 1];

/** 벽면별 rotationY. three 의 y 회전은 (0,0,1)→(sinθ,0,cosθ) 라 왼쪽 벽(정면 +x)이 +π/2 다 */
export const WALL_ROT = { left: Math.PI / 2, right: -Math.PI / 2, far: 0, near: Math.PI } as const;
export const sideRot = (side: Side): number => (side < 0 ? WALL_ROT.left : WALL_ROT.right);

/** 8각 단면의 입력 — 벽 안쪽 면 x · 수직 벽 끝 높이 · 천장 높이 · 천장 반폭 · 길이 방향 양 끝 z */
export interface Profile {
  wallX: number;
  wallTopY: number;
  ceilingY: number;
  ceilHalf: number;
  farZ: number;
  nearZ: number;
}

/** Profile 에서 파생되는 경사면 기하 — 맵 모듈이 한 번 계산해 둔다 */
export interface Metrics extends Profile {
  run: number;
  rise: number;
  len: number;
  /** 경사면이 수직에서 안쪽으로 기운 각 — 경사면 위 부품을 z 축으로 이만큼 돌린다 (왼쪽 벽은 −, 오른쪽은 +) */
  tilt: number;
  /** 경사면 가운데 (x 는 오른쪽 벽 기준 양수) */
  mid: { x: number; y: number };
  /** 경사면의 실내 쪽 법선 (오른쪽 벽 기준: −x 로, 아래로) */
  normal: { x: number; y: number };
  width: number;
  length: number;
  midZ: number;
}

export function metrics(p: Profile): Metrics {
  const run = p.wallX - p.ceilHalf;
  const rise = p.ceilingY - p.wallTopY;
  const len = Math.hypot(run, rise);
  return {
    ...p,
    run,
    rise,
    len,
    tilt: Math.atan2(run, rise),
    mid: { x: (p.wallX + p.ceilHalf) / 2, y: (p.wallTopY + p.ceilingY) / 2 },
    normal: { x: -rise / len, y: -run / len },
    width: p.wallX * 2,
    length: p.nearZ - p.farZ,
    midZ: (p.nearZ + p.farZ) / 2,
  };
}

type P = [number, number];

/**
 * 8각 아치 프로필 — 단면을 안쪽으로 inset 만큼 들인 6점 (왼쪽 발치 → 왼쪽 어깨 → 왼쪽 천장 → 오른쪽 천장 → 오른쪽 어깨 → 오른쪽 발치).
 * 경사면의 오프셋 선과 벽·천장 선의 교점을 푼다. inset 이 음수면 바깥으로 넓어진다 (리브 바깥 테두리 — 벽 속에 묻힌다).
 */
export function archProfile(m: Metrics, inset: number, floorY: number): P[] {
  const { run, rise, len: L } = m;
  const x = m.wallX - inset;
  const top = m.ceilingY - inset;
  // 오른쪽 경사면: P(t) = (wallX, wallTopY) + t·(−run, rise)/L + n·inset, n = (−rise, −run)/L
  const shoulderT = (inset * (L - rise)) / run;
  const shoulderY = m.wallTopY + (shoulderT * rise) / L - (run * inset) / L;
  const crownT = ((rise - inset + (run * inset) / L) * L) / rise;
  const crownX = m.wallX - (crownT * run) / L - (rise * inset) / L;
  return [
    [-x, floorY],
    [-x, shoulderY],
    [-crownX, top],
    [crownX, top],
    [x, shoulderY],
    [x, floorY],
  ];
}

/** 벽 텍스처 한 장의 실제 높이(m) — 옆벽·끝벽·경사면이 같은 결 크기를 갖게 하는 기준 */
export const WALL_TILE = 3.2;
/** 바닥 강판 텍스처 한 장의 실제 크기(m) — 한 장에 큰 판 3×4 */
export const FLOOR_TILE = 4.2;

/** 끝벽 — 단면 그대로의 8각 판. UV 는 월드 m / tile — 기본은 옆벽과 같은 결 크기, 넓은 홀의 끝벽은 tile 을 키워 결을 크게(산만하지 않게) */
export function makeEndWallGeometry(m: Metrics, tile: number = WALL_TILE, opening?: Opening): THREE.ShapeGeometry {
  const pts = archProfile(m, 0, 0);
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  /*
   * 문이 있는 끝벽은 **뚫는다** (2026-08-30 사용자: "문 열릴 때 벽이 보인다").
   * 여태 격납문은 **막힌 벽에 붙은 장식**이었다 — 문짝이 천장으로 올라가면 그 뒤의 강판 벽이 그대로 드러나서,
   * 열린 문이 「다음 구역으로 가는 길」이 아니라 「벽에 난 자국」으로 읽혔다.
   * 개구는 문짝보다 조금 작게 잡는다(Doorway.INSET) — 닫혀 있을 때 문짝이 개구 가장자리를 덮어 이음매가 안 보인다.
   * 바닥에서 살짝 띄우는 것도 같은 이유다: 개구가 바깥 윤곽선에 닿으면 삼각분할이 깨진다.
   */
  if (opening) {
    const hw = opening.w / 2;
    const y0 = 0.02;
    shape.holes.push(
      new THREE.Path([
        new THREE.Vector2(-hw, y0),
        new THREE.Vector2(hw, y0),
        new THREE.Vector2(hw, opening.h),
        new THREE.Vector2(-hw, opening.h),
      ]),
    );
  }
  const g = new THREE.ShapeGeometry(shape);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getY(i) / tile);
  uv.needsUpdate = true;
  return g;
}

/* ─────────────────────────────── 문간 (열린 문 뒤) ─────────────────────────────── */

/** 끝벽에 뚫는 개구 — 문짝 규격에서 INSET 만큼 작다 */
export interface Opening {
  w: number;
  h: number;
}

/**
 * 문짝보다 개구를 이만큼 좁힌다(양쪽 합). 닫힌 문이 개구 가장자리를 덮어야 이음매·Z 다툼이 안 보인다.
 * 문 폭 3.6 기준 개구 3.36 — 격벽 링 안쪽(≈3.74)보다 좁아 링 테두리 안에 깔끔히 든다.
 */
export const DOOR_INSET = 0.24;

/** 문짝 규격 → 끝벽 개구 */
export const openingFor = (door: { w: number; h: number }): Opening => ({
  w: door.w - DOOR_INSET,
  h: door.h - DOOR_INSET / 2,
});

/** 문간 치수 — 깊이는 「안이 있다」가 읽힐 만큼만. 더 파 봐야 어두워서 안 보인다 */
export const DOORWAY = { depth: 3.4, pad: 0.6, strip: { h: 0.07, lift: 0.02 } } as const;

/** 리브 단면 — 벽에서 안으로 나오는 깊이(d)·길이 방향 두께(t)·모서리 베벨 */
export interface RibSpec {
  d: number;
  t: number;
  bevel: number;
}

/**
 * 격벽 리브 — 바깥 아치(벽 속으로 0.15 묻힘)에서 안쪽 아치(d 인셋)를 뺀 한 붓 폴리곤을 z 로 t 압출. 구멍이 아니라
 * 한 폴리곤으로 그리는 이유: 두 아치 다 바닥까지 내려와 구멍이 테두리에 닿기 때문이다. 베벨이 모서리 하이라이트를 만든다.
 */
export function makeRibGeometry(m: Metrics, rib: RibSpec): THREE.ExtrudeGeometry {
  const outer = archProfile(m, -0.15, -0.1);
  const inner = archProfile(m, rib.d, -0.1);
  const ring = [...outer, ...[...inner].reverse()];
  const shape = new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: rib.t, bevelEnabled: true, bevelThickness: rib.bevel, bevelSize: rib.bevel, bevelSegments: 1 });
  g.translate(0, 0, -rib.t / 2);
  g.computeVertexNormals();
  return g;
}

/* ─────────────────────────────── 재질 (모듈 수준, 공유) ─────────────────────────────── */

export const hdr = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k);
/**
 * 청백 튜브. ★ 배율 1.0 도 "게임하는데 눈이 아프다"였다 (2026-08-29, 여러 번) — 0.62 의 연한 하늘색. 순백에 가까울수록 눈이 아프다.
 */
export const TUBE_MAT = new THREE.MeshBasicMaterial({ color: hdr('#a9c4e6', 0.62), toneMapped: false });
/** 머리 위 경사면 튜브 — 시야 위쪽에 계속 걸리므로 한 단 더 어둡게 */
export const UPPER_TUBE_MAT = new THREE.MeshBasicMaterial({ color: hdr('#9bb6d8', 0.42), toneMapped: false });
/** 리브 세로 띠 — 튜브보다 한 단 낮은 청색 */
export const STRIP_MAT = new THREE.MeshBasicMaterial({ color: hdr('#4d8fd6', 0.7), toneMapped: false });
/** 콘솔 표시등 — 주황 점 */
export const WARM_MAT = new THREE.MeshBasicMaterial({ color: hdr('#ff9a3a', 0.7), toneMapped: false });
/** 튜브 둘레의 어두운 틀 — 튜브가 벽에 "박혀" 보이게 */
export const BEZEL_MAT = new THREE.MeshStandardMaterial({ color: '#0b0e14', roughness: 0.6, metalness: 0.5 });
/** 리브·절차 생성 구조물 — 무광 남색 강철. 베벨 모서리가 점광원을 받아 형태를 낸다 */
export const STEEL_MAT = new THREE.MeshStandardMaterial({ color: '#2a333f', roughness: 0.5, metalness: 0.6 });
/** 셸 면 — 전부 무광 (metalness 는 환경맵이 없으면 디퓨즈만 깎아 검게 만든다) */
export const SHELL_COLORS = { wall: '#dde3eb', chamfer: '#cdd5de', ceiling: '#b4bdc8', floor: '#f2f6fa', grate: '#a4aebb' } as const;

const DOORWAY_MAT = new THREE.MeshStandardMaterial({ color: '#161c25', roughness: 0.85, metalness: 0.4, side: THREE.BackSide });
/** 문간 안쪽 끝의 희미한 띠 — 완전한 검정은 구멍이 아니라 렌더 오류처럼 보인다 */
const DOORWAY_STRIP_MAT = new THREE.MeshBasicMaterial({ color: hdr('#4d8fd6', 0.35), toneMapped: false });

/**
 * 문 뒤의 어두운 문간 — 문짝이 올라갔을 때 **강판 벽 대신 안쪽**이 보이게 한다.
 * 끝벽의 개구(makeEndWallGeometry 의 opening)와 짝이다: 벽을 뚫고, 그 뒤에 이 상자를 둔다.
 *
 * 상자는 안쪽 면만 그린다(BackSide). 개구보다 넉넉히 크게 잡아 가장자리가 벽 뒤로 숨는다 —
 * 방 안에서는 개구로 잘린 만큼만 보이므로 상자가 커도 티가 안 난다.
 */
export function Doorway({
  z,
  dir,
  opening,
  depth = DOORWAY.depth,
}: {
  /** 끝벽의 z */
  z: number;
  /** 문간이 뻗어 나가는 방향 — 먼 끝벽이면 −1, 가까운 끝벽이면 +1 */
  dir: 1 | -1;
  opening: Opening;
  depth?: number;
}) {
  const w = opening.w + DOORWAY.pad;
  const h = opening.h + DOORWAY.pad;
  const back = z + dir * depth;
  return (
    <group name="문간">
      <mesh position={[0, h / 2, z + (dir * depth) / 2]} material={DOORWAY_MAT}>
        <boxGeometry args={[w, h, depth]} />
      </mesh>
      <mesh position={[0, DOORWAY.strip.h / 2 + DOORWAY.strip.lift, back - dir * 0.06]} material={DOORWAY_STRIP_MAT}>
        <boxGeometry args={[opening.w * 0.8, DOORWAY.strip.h, 0.04]} />
      </mesh>
    </group>
  );
}

/**
 * Tripo 부품의 색 — 알베도는 버리고 이 단색에 원본 노멀맵을 얹는다 (useShapedMaterial).
 * metal_case(격납고 홀 바닥의 화물 컨테이너)만 벽·콘솔보다 밝다 — **바닥에 놓인 물건은 건물과 값이 갈려야 한다.**
 * 벽 색으로 두면 옆벽 근처에서 검은 덩어리로 뭉개진다 (점광원 8개가 홀 한가운데 줄로만 있어 옆이 어둡다).
 */
export const PART_COLORS = { sci_bulkhead: '#2d3744', sci_console: '#2a333f', sci_blast_door: '#343f4d', ring_lamp: '#2d3744', metal_case: '#4a5563', cargo_container: '#4a5563', crane_hoist: '#5a6472', charge_dock: '#4b5665', watch_drone: '#5d6879',
  /* 옆벽에서 움직이는 둘 — 벽(#2a333f 언저리)보다 밝게 둔다. 벽 색이면 움직여도 안 보인다 */
  hall_fan: '#5a6472', wall_arm: '#5d6879',
  /* 특수인공지능대응센터 홀(map/govcenter.tsx) — 콘크리트 홀이라 부품은 어두운 강철·회색 도장. 랙만 검정에 가깝다 (서버실은 어둡다) */
  gov_server_rack: '#22262d', gov_workstation: '#6a707a', gov_steel_door: '#6c717a', gov_wall_lamp: '#4c515a',
  /* 옆벽 콘솔 — 복도의 sci_console(#2a333f)보다 밝게. 이 홀은 콘솔에 발광 띠를 안 얹으므로 그 값이면 벽 밑 어둠에 묻힌다 */
  gov_console: '#5b626c',
  /* 움직이는 플랫폼 — 발판은 바닥보다 밝은 강청색 강철(올라설 자리가 읽혀야 한다), 비콘은 어두운 강철 */
  hover_pad: '#6f7c8c', pad_beacon: '#3a414b' } as const;
export type ShapedPartId = keyof typeof PART_COLORS;

/**
 * Tripo 부품 재질 — 원본을 복제해 알베도(map)를 떼고 단색을 넣는다. 노멀맵(패널 홈·볼트)만 남긴다.
 * metallicRoughness 맵도 뗀다 — 일부 면의 거칠기가 0 근처라 점광원이 거울처럼 번졌다. 부품당 한 번 만들어 캐시.
 */
const shapedCache = new Map<string, THREE.MeshStandardMaterial>();
/**
 * tint 를 주면 PART_COLORS 대신 그 색을 쓴다 — **같은 GLB 를 맵마다 다른 색으로 세울 때만.**
 * (화물 컨테이너: 격납고 홀은 강청색 그대로, 콘크리트 홀은 중성 회색 — map/govcenter.tsx 의 CARGO_TINT)
 * 캐시 키가 id + tint 라 두 맵이 서로의 재질을 덮어쓰지 않는다. 색을 **모든 맵에서** 바꿀 것이면 PART_COLORS 를 고친다.
 */
export function useShapedMaterial(id: ShapedPartId, tint?: string): THREE.MeshStandardMaterial {
  const src = usePartSource(id);
  const key = tint ? `${id}:${tint}` : id;
  let m = shapedCache.get(key);
  if (!m) {
    m = (src.material as THREE.MeshStandardMaterial).clone();
    m.map = null;
    m.roughnessMap = null;
    m.metalnessMap = null;
    m.color.set(tint ?? PART_COLORS[id]);
    m.metalness = 0.45;
    m.roughness = 0.62;
    m.name = `${m.name} (shaped)`;
    m.needsUpdate = true;
    shapedCache.set(key, m);
  }
  return m;
}

/* ─────────────────────────────── 텍스처 ─────────────────────────────── */

/** 강판 텍스처 5장(힉스필드 Seedream → sharp 정규화) — public/textures/corridor/. 격납고 홀도 같은 장을 쓴다 */
export const SCI_TEX = {
  wall: '/textures/corridor/wall.webp',
  floor: '/textures/corridor/floor.webp',
  ceiling: '/textures/corridor/ceiling.webp',
  grate: '/textures/corridor/grate.webp',
  console: '/textures/corridor/console.webp',
} as const;
useTexture.preload([SCI_TEX.wall, SCI_TEX.floor, SCI_TEX.ceiling, SCI_TEX.grate, SCI_TEX.console]);

export interface SciTextures {
  wall: THREE.Texture;
  floor: THREE.Texture;
  ceiling: THREE.Texture;
  grate: THREE.Texture;
  console: THREE.Texture;
}

export function useSciTextures(): SciTextures {
  const [wall, floor, ceiling, grate, console] = useTexture([SCI_TEX.wall, SCI_TEX.floor, SCI_TEX.ceiling, SCI_TEX.grate, SCI_TEX.console]);
  return { wall, floor, ceiling, grate, console };
}

/** 가로 줄무늬 데이터 화면 — 결정적 난수라 새로고침마다 같다. 캔버스가 없는 환경(jsdom)에서는 null */
function makeDataScreenTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const W = 128;
  const H = 192;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  let seed = 11;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  ctx.fillStyle = '#07111f';
  ctx.fillRect(0, 0, W, H);
  for (let y = 10; y < H - 8; y += 9) {
    const w = 30 + rnd() * 80;
    ctx.fillStyle = rnd() > 0.8 ? '#dff0ff' : '#5ea3ea';
    ctx.fillRect(10, y, w, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 데이터 화면(줄무늬 캔버스)·콘솔 패널 면(텍스처) 재질 — 맵 컴포넌트 안에서 한 번 */
export function useScreenMaterials(consoleTex: THREE.Texture) {
  const mats = useMemo(() => {
    const screenMap = makeDataScreenTexture();
    const panel = consoleTex.clone();
    panel.colorSpace = THREE.SRGBColorSpace;
    panel.anisotropy = 8;
    panel.needsUpdate = true;
    return {
      screen: new THREE.MeshBasicMaterial({ map: screenMap, color: screenMap ? hdr('#ffffff', 0.55) : hdr('#4d8fd6', 0.4), toneMapped: false }),
      /** 콘솔 패널 면 — 어두운 곳에서도 읽히게 스스로 조금 빛난다 */
      panel: new THREE.MeshStandardMaterial({ map: panel, emissiveMap: panel, emissive: '#ffffff', emissiveIntensity: 0.28, roughness: 0.55, metalness: 0.4 }),
    };
  }, [consoleTex]);
  useEffect(
    () => () => {
      mats.screen.map?.dispose();
      mats.screen.dispose();
      mats.panel.map?.dispose();
      mats.panel.dispose();
    },
    [mats],
  );
  return mats;
}

/* ─────────────────────────────── 부품 규격 (두 맵 공통) ─────────────────────────────── */

/** 경사면 가로 튜브 — bay 마다 하나, 경사면 한가운데. len 은 z 길이, w 는 경사면을 따라가는 폭, bezel 은 둘레의 어두운 틀 */
export const UPPER_TUBE = { len: 1.6, w: 0.14, bezel: { len: 2.0, w: 0.42 }, lift: 0.03 } as const;
/** 벽 세로 튜브 — bay 중심. 옆에 데이터 화면 */
export const WALL_TUBE = { y0: 1.55, y1: 2.65, w: 0.12, bezel: { w: 0.34, pad: 0.16 }, lift: 0.03 } as const;
/** 세로 튜브 옆 데이터 화면(가로 줄무늬) — 튜브에서 dz 만큼 (먼 끝 쪽이 −) */
export const DATA_SCREEN = { w: 0.42, h: 0.62, y: 2.2, dz: -0.55 } as const;
/** 튜브 반대쪽 콘솔 패널 면(텍스처) */
export const PANEL_FACE = { size: 0.9, y: 1.65, dz: 0.8 } as const;
/** 리브 안쪽 면의 세로 발광 띠 — 얇게 */
export const RIB_STRIP = { w: 0.05, y0: 0.9, y1: 2.6 } as const;
/** 콘솔 상자(Tripo sci_console) — 벽에 붙는 낮은 장비함. 높이 0.85 는 점프(≈1.05)로 올라설 수 있다 */
export const CONSOLE = { len: 2.4, d: 0.7, h: 0.85 } as const;
export const CONSOLE_FIT: Fit = { x: CONSOLE.d, y: CONSOLE.h, z: CONSOLE.len };
/** 콘솔 앞면의 가로 튜브 + 그 아래 주황 표시등 두 점 */
export const CONSOLE_TUBE = { y: 0.58, len: 1.5, w: 0.09, lift: 0.02 } as const;
export const CONSOLE_DOTS = { y: 0.22, dz: 0.55, size: 0.05 } as const;
/** 양쪽 가장자리 격자 배수로 — 벽에서 inset 안쪽에 폭 w */
export const GRATE = { w: 0.55, inset: 0.12, lift: 0.004 } as const;

/* ─────────────────────────────── 배치 배열 만들기 (맵 모듈 수준에서 한 번) ─────────────────────────────── */

/** 경사면 위의 한 점 — 경사면 가운데에서 실내 쪽 법선으로 lift 만큼 */
export function onChamfer(m: Metrics, s: Side, z: number, lift: number): [number, number, number] {
  return [s * m.mid.x + s * m.normal.x * lift, m.mid.y + m.normal.y * lift, z];
}
/** 경사면 부품의 회전 — 상자의 local y 가 경사면을 따라 올라가고 local x 가 법선이 된다 */
export const chamferRot = (m: Metrics, s: Side): [number, number, number] => [0, 0, s * m.tilt];

export interface TubeSet {
  bezels: Item[];
  tubes: Item[];
}

/** 경사면 가로 튜브 — bay 마다 양쪽 */
export function upperTubes(m: Metrics, zs: readonly number[]): TubeSet {
  return {
    bezels: zs.flatMap((z) => SIDES.map((s): Item => ({ position: onChamfer(m, s, z, 0.01), scale: [0.04, UPPER_TUBE.bezel.w, UPPER_TUBE.bezel.len], rotation: chamferRot(m, s) }))),
    tubes: zs.flatMap((z) => SIDES.map((s): Item => ({ position: onChamfer(m, s, z, UPPER_TUBE.lift + 0.025), scale: [0.05, UPPER_TUBE.w, UPPER_TUBE.len], rotation: chamferRot(m, s) }))),
  };
}

/** 벽 세로 튜브 — bay 중심, 양쪽 */
export function wallTubes(m: Metrics, zs: readonly number[]): TubeSet {
  const y = (WALL_TUBE.y0 + WALL_TUBE.y1) / 2;
  const h = WALL_TUBE.y1 - WALL_TUBE.y0;
  return {
    bezels: zs.flatMap((z) => SIDES.map((s): Item => ({ position: [s * (m.wallX - 0.02), y, z], scale: [0.04, h + WALL_TUBE.bezel.pad * 2, WALL_TUBE.bezel.w] }))),
    tubes: zs.flatMap((z) => SIDES.map((s): Item => ({ position: [s * (m.wallX - WALL_TUBE.lift - 0.025), y, z], scale: [0.05, h, WALL_TUBE.w] }))),
  };
}

/** 세로 튜브 옆 데이터 화면 — 벽면에 얇게 */
export function dataScreens(m: Metrics, zs: readonly number[]): Item[] {
  return zs.flatMap((z) => SIDES.map((s): Item => ({ position: [s * (m.wallX - 0.012), DATA_SCREEN.y, z + DATA_SCREEN.dz], scale: [0.024, DATA_SCREEN.h, DATA_SCREEN.w] })));
}

/** 튜브 반대쪽 콘솔 패널 면 */
export function panelFaces(m: Metrics, zs: readonly number[]): Item[] {
  return zs.flatMap((z) => SIDES.map((s): Item => ({ position: [s * (m.wallX - 0.012), PANEL_FACE.y, z + PANEL_FACE.dz], scale: [0.024, PANEL_FACE.size, PANEL_FACE.size] })));
}

/** 리브 안쪽 면의 세로 발광 띠 — 리브마다 양쪽 하나씩 */
export function ribStrips(m: Metrics, zs: readonly number[], rib: RibSpec): Item[] {
  return zs.flatMap((z) =>
    SIDES.map((s): Item => ({ position: [s * (m.wallX - rib.d - 0.012), (RIB_STRIP.y0 + RIB_STRIP.y1) / 2, z], scale: [0.024, RIB_STRIP.y1 - RIB_STRIP.y0, RIB_STRIP.w] })),
  );
}

export interface ConsoleSet {
  /** Parts(sci_console) 에 넘기는 발밑 배치. 모델의 앞면(홈 파인 면)이 +x 를 본다 — 왼쪽 벽은 그대로, 오른쪽 벽은 π */
  parts: InstanceItem[];
  tubes: Item[];
  dots: Item[];
}

/** 옆벽 콘솔 — bay 중심 z 마다 양쪽. 뒷면이 벽면 */
export function sideConsoles(m: Metrics, zs: readonly number[]): ConsoleSet {
  const cx = m.wallX - CONSOLE.d / 2;
  const front = m.wallX - CONSOLE.d;
  return {
    parts: zs.flatMap((z) => SIDES.map((s): InstanceItem => ({ position: [s * cx, 0, z], rotationY: s < 0 ? 0 : Math.PI }))),
    tubes: zs.flatMap((z) => SIDES.map((s): Item => ({ position: [s * (front - CONSOLE_TUBE.lift - 0.025), CONSOLE_TUBE.y, z], scale: [0.05, CONSOLE_TUBE.w, CONSOLE_TUBE.len] }))),
    dots: zs.flatMap((z) =>
      SIDES.flatMap((s) => [-1, 1].map((k): Item => ({ position: [s * (front - 0.02), CONSOLE_DOTS.y, z + k * CONSOLE_DOTS.dz], scale: [0.03, CONSOLE_DOTS.size, CONSOLE_DOTS.size * 2] }))),
    ),
  };
}

/* ─────────────────────────────── 컴포넌트 ─────────────────────────────── */

export interface ShellProps {
  m: Metrics;
  tex: SciTextures;
  /** 끝벽 지오메트리 (makeEndWallGeometry — 맵 모듈 수준에서 한 번). 안 주면 끝벽을 그리지 않는다 (맵이 직접 그린다) */
  endWall?: THREE.BufferGeometry;
  /**
   * 가까운 끝벽만 다른 지오메트리 — 한쪽에만 문이 뚫린 방(재검실)이 쓴다.
   * 안 주면 양 끝이 같은 endWall 을 쓴다 (양쪽 다 문이 있는 복도·중앙 시설).
   */
  nearWall?: THREE.BufferGeometry;
  /** 이 방향 끝벽은 그리지 않는다 — 맵이 창·문 등으로 직접 채울 때 */
  skipFar?: boolean;
  skipNear?: boolean;
}

/** 8각 셸 — 강판 바닥 + 격자 배수로 + 수직 벽 + 45° 경사면 + 천장 + 끝벽. 전부 안쪽을 보는 단면 평면, 전부 무광 */
export function Shell({ m, tex, endWall, nearWall, skipFar = false, skipNear = false }: ShellProps) {
  const sideTex = useTiled(tex.wall, m.length / WALL_TILE, 1);
  const chamferTex = useTiled(tex.wall, m.length / WALL_TILE, m.len / WALL_TILE);
  /** 끝벽은 UV 가 월드 m/WALL_TILE 이라 반복 1 — 감싸기만 켠다 */
  const endTex = useTiled(tex.wall, 1, 1, false);
  const ceilingTex = useTiled(tex.ceiling, m.ceilHalf / 2.4, m.length / 4.8);
  const floorTex = useTiled(tex.floor, m.width / FLOOR_TILE, m.length / FLOOR_TILE);
  const grateTex = useTiled(tex.grate, 1, m.length / GRATE.w, false);
  const grateX = m.wallX - GRATE.inset - GRATE.w / 2;

  return (
    <group name="셸">
      <mesh name="바닥" rotation-x={-Math.PI / 2} position={[0, 0, m.midZ]}>
        <planeGeometry args={[m.width, m.length]} />
        <meshStandardMaterial map={floorTex} color={SHELL_COLORS.floor} roughness={0.92} metalness={0} />
      </mesh>
      {SIDES.map((s) => (
        <mesh key={`grate:${s}`} name="배수로 격자" rotation-x={-Math.PI / 2} position={[s * grateX, GRATE.lift, m.midZ]}>
          <planeGeometry args={[GRATE.w, m.length]} />
          <meshStandardMaterial map={grateTex} color={SHELL_COLORS.grate} roughness={0.9} metalness={0} />
        </mesh>
      ))}
      {SIDES.map((s) => (
        <group key={`wall:${s}`} name={s < 0 ? '왼쪽 벽' : '오른쪽 벽'}>
          <mesh name="강판 벽" position={[s * m.wallX, m.wallTopY / 2, m.midZ]} rotation-y={sideRot(s)}>
            <planeGeometry args={[m.length, m.wallTopY]} />
            <meshStandardMaterial map={sideTex} color={SHELL_COLORS.wall} roughness={0.9} metalness={0} />
          </mesh>
          <group position={[s * m.mid.x, m.mid.y, m.midZ]} rotation={chamferRot(m, s)}>
            <mesh name="경사면" rotation-y={sideRot(s)}>
              <planeGeometry args={[m.length, m.len]} />
              <meshStandardMaterial map={chamferTex} color={SHELL_COLORS.chamfer} roughness={0.95} metalness={0} />
            </mesh>
          </group>
        </group>
      ))}
      <mesh name="천장" position={[0, m.ceilingY, m.midZ]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[m.ceilHalf * 2, m.length]} />
        <meshStandardMaterial map={ceilingTex} color={SHELL_COLORS.ceiling} roughness={0.95} metalness={0} />
      </mesh>
      {endWall && !skipFar ? (
        <mesh name="먼 끝벽" geometry={endWall} position={[0, 0, m.farZ]} rotation-y={WALL_ROT.far}>
          <meshStandardMaterial map={endTex} color={SHELL_COLORS.wall} roughness={0.9} metalness={0} />
        </mesh>
      ) : null}
      {(nearWall ?? endWall) && !skipNear ? (
        <mesh name="가까운 끝벽" geometry={nearWall ?? endWall} position={[0, 0, m.nearZ]} rotation-y={WALL_ROT.near}>
          <meshStandardMaterial map={endTex} color={SHELL_COLORS.wall} roughness={0.9} metalness={0} />
        </mesh>
      ) : null}
    </group>
  );
}

/** 리브 여러 개 — 같은 압출 지오메트리(makeRibGeometry)를 InstancedMesh 하나로 */
export function RibRun({ geometry, zs }: { geometry: THREE.BufferGeometry; zs: readonly number[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const mat = new THREE.Matrix4();
    zs.forEach((z, i) => mesh.setMatrixAt(i, mat.makeTranslation(0, 0, z)));
    mesh.count = zs.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [zs]);
  return <instancedMesh ref={ref} args={[geometry, STEEL_MAT, zs.length]} name="격벽 리브" />;
}

export interface WallKitProps {
  upper: TubeSet;
  wall: TubeSet;
  screens: Item[];
  panels: Item[];
  strips: Item[];
  consoles: ConsoleSet;
  consoleMaterial: THREE.Material;
  screenMaterials: { screen: THREE.Material; panel: THREE.Material };
}

/** 옆벽 장식 한 벌 — 튜브 세 단·데이터 화면·콘솔 패널 면·리브 띠·콘솔·표시등. 배열은 전부 맵 모듈 수준 상수여야 한다 */
export function WallKit({ upper, wall, screens, panels, strips, consoles, consoleMaterial, screenMaterials }: WallKitProps) {
  // 튜브·틀은 종류를 합쳐 드로우콜 하나씩 — 배열 참조가 바뀌지 않게 메모
  const bezels = useMemo(() => [...upper.bezels, ...wall.bezels], [upper, wall]);
  const tubes = useMemo(() => [...wall.tubes, ...consoles.tubes], [wall, consoles]);
  return (
    <group name="벽 장식">
      <Instanced name="리브 발광 띠" items={strips} material={STRIP_MAT} receiveShadow={false} />
      <Instanced name="튜브 틀" items={bezels} material={BEZEL_MAT} />
      <Instanced name="발광 튜브" items={tubes} material={TUBE_MAT} receiveShadow={false} />
      <Instanced name="상부 튜브" items={upper.tubes} material={UPPER_TUBE_MAT} receiveShadow={false} />
      <Instanced name="데이터 화면" items={screens} material={screenMaterials.screen} receiveShadow={false} />
      <Instanced name="콘솔 패널 면" items={panels} material={screenMaterials.panel} />
      <PartsConsoles items={consoles.parts} material={consoleMaterial} />
      <Instanced name="콘솔 표시등" items={consoles.dots} material={WARM_MAT} receiveShadow={false} />
    </group>
  );
}

/** 콘솔 GLB — fit 상수를 한 곳에 두려고 감쌌다 */
function PartsConsoles({ items, material }: { items: readonly InstanceItem[]; material: THREE.Material }) {
  return <Parts id="sci_console" fit={CONSOLE_FIT} items={items} material={material} />;
}

/** 네 모서리를 c 만큼 깎은 직사각형 (중심 원점, XY 평면) — 관찰창·무대 같은 8각 형상의 바탕 */
export function chamferedRect(w: number, h: number, c: number): THREE.Shape {
  const x = w / 2;
  const y = h / 2;
  const sh = new THREE.Shape();
  sh.moveTo(-x + c, -y);
  sh.lineTo(x - c, -y);
  sh.lineTo(x, -y + c);
  sh.lineTo(x, y - c);
  sh.lineTo(x - c, y);
  sh.lineTo(-x + c, y);
  sh.lineTo(-x, y - c);
  sh.lineTo(-x, -y + c);
  sh.closePath();
  return sh;
}
