/**
 * 시나리오 2 방들의 공통 뼈대 — 8각 강판 방 하나를 **치수만으로** 세운다.
 *
 * 본판(복도·중앙 시설·재검실)은 방마다 layout.ts 를 하나씩 두고 bay·리브·벽 충돌을 손으로 늘어놓는다.
 * 시나리오 2 가 더하는 방은 넷이고 전부 「보고, 서 있고, 읽는」 방이라 그 손품이 값을 못 한다 —
 * 그래서 여기서 한 번에 만든다. 부품 자체는 본판과 **같은 키트**(world/map/scifi.tsx)를 쓴다:
 * 새 방이 옛 방과 다른 시설처럼 보이면 「같은 구역」이라는 말이 거짓이 된다.
 *
 * 방마다 다른 것(가구·조명·문)만 방 파일이 얹는다. 여기서 나오는 충돌 목록은 mp/collide.ts 의 순수 함수로 그대로 들어간다.
 */

import type { Item } from '@/world/map/parts';
import { CONSOLE, metrics, type ConsoleSet, type Metrics, type Profile, type RibSpec, type TubeSet } from '@/world/map/scifi';
import type { Collider } from '@/world/mp/collide';

/**
 * 벽 장식을 **비우는** 자리 — WallKit 은 한 벌을 통째로 받으므로, 안 다는 장식은 빈 배열로 준다.
 * 모듈 수준 상수라야 한다 (WallKit 안의 useMemo 가 참조로 비교한다).
 */
export const NO_TUBES: TubeSet = { bezels: [], tubes: [] };
export const NO_ITEMS: readonly Item[] = [];
export const NO_CONSOLES: ConsoleSet = { parts: [], tubes: [], dots: [] };

/** 부품 사이 최소 여유(m) — 붙이면 깊이 다툼이 나고, 벌리면 틈이 보인다 (본판과 같은 값) */
export const GAP = 0.02;
/** 격벽 리브 — 본판 복도와 같은 규격 */
export const RIB: RibSpec = { d: 0.4, t: 0.7, bevel: 0.03 };
/** 격벽 링(Tripo sci_bulkhead) · 격납문 — 재검실과 같은 규격 */
export const RING_SCALE = 6;
export const RING = { scale: RING_SCALE, sink: 0.12 * RING_SCALE, thickness: 0.9 } as const;
export const DOOR = { w: 3.6, h: 3.7, depth: 0.35 } as const;
/** Tripo 링 모델 치수 — 폭 0.894 · 높이 1. 균등 배율이어야 45° 챔퍼가 산다 */
export const RING_MODEL = { w: 0.894, h: 1 } as const;

const WALL_T = 1;
const WALL_TOP = 6;

export interface RoomSpec {
  wallX: number;
  farZ: number;
  nearZ: number;
  wallTopY: number;
  ceilingY: number;
  /** bay 하나의 목표 길이(m). 방 길이를 여기에 가장 가깝게 등분한다 */
  bay?: number;
  /**
   * 그쪽 끝이 **뚫려 있다** — 끝벽 대신 다른 조각(꺾임 마디)이 이어진다. 그 끝의 벽 충돌을 안 만들고,
   * 옆벽 충돌도 그 끝 너머로 안 내민다 (내밀면 이어진 조각의 통로를 유령 벽이 막는다).
   */
  open?: { far?: boolean; near?: boolean };
}

export interface Room {
  profile: Profile;
  m: Metrics;
  midZ: number;
  /** bay 중심 z — 벽 장식·광원이 여기 걸린다 */
  bays: readonly number[];
  /** 리브 z — bay 와 bay 의 경계 */
  ribs: readonly number[];
  /** 벽 넷 + 리브 (콘솔은 방마다 다르므로 따로) */
  colliders: readonly Collider[];
}

/**
 * 8각 단면을 만든다 — 천장 반폭은 45° 가 되도록 벽 x 에서 (천장 − 수직 벽 끝) 만큼 들인다.
 * 그 규칙을 방마다 다시 적으면 어느 방 하나가 조용히 어긋난다.
 */
export function makeRoom(spec: RoomSpec): Room {
  const { wallX, farZ, nearZ, wallTopY, ceilingY, bay = 4, open = {} } = spec;
  const profile: Profile = { wallX, wallTopY, ceilingY, ceilHalf: wallX - (ceilingY - wallTopY), farZ, nearZ };
  const m = metrics(profile);

  const n = Math.max(1, Math.round(m.length / bay));
  const step = m.length / n;
  const bays: number[] = [];
  const ribs: number[] = [];
  for (let i = 0; i < n; i += 1) {
    bays.push(round(farZ + step * (i + 0.5)));
    if (i > 0) ribs.push(round(farZ + step * i));
  }

  const midZ = m.midZ;
  // 옆벽은 막힌 끝 너머로 1 m 내민다 (끝벽과 이음매가 안 새게). 뚫린 끝에서는 딱 끊는다
  const sideFar = open.far ? farZ : farZ - 1;
  const sideNear = open.near ? nearZ : nearZ + 1;
  const sideZ = (sideFar + sideNear) / 2;
  const sideHd = (sideNear - sideFar) / 2;
  const colliders: Collider[] = [
    { x: -(wallX + WALL_T / 2), z: sideZ, hw: WALL_T / 2, hd: sideHd, rot: 0, top: WALL_TOP },
    { x: wallX + WALL_T / 2, z: sideZ, hw: WALL_T / 2, hd: sideHd, rot: 0, top: WALL_TOP },
    ...(open.far ? [] : [{ x: 0, z: farZ - WALL_T / 2, hw: wallX + 1, hd: WALL_T / 2, rot: 0, top: WALL_TOP }]),
    ...(open.near ? [] : [{ x: 0, z: nearZ + WALL_T / 2, hw: wallX + 1, hd: WALL_T / 2, rot: 0, top: WALL_TOP }]),
    ...ribs.flatMap((z) => [
      { x: -(wallX - RIB.d / 2), z, hw: RIB.d / 2, hd: RIB.t / 2, rot: 0, top: WALL_TOP },
      { x: wallX - RIB.d / 2, z, hw: RIB.d / 2, hd: RIB.t / 2, rot: 0, top: WALL_TOP },
    ]),
  ];

  return { profile, m, midZ, bays, ribs, colliders };
}

/** 옆벽 콘솔의 충돌 — 콘솔을 세운 bay 만 (방마다 다르다) */
export function consoleColliders(wallX: number, zs: readonly number[]): Collider[] {
  return zs.flatMap((z) => [
    { x: -(wallX - CONSOLE.d / 2), z, hw: CONSOLE.d / 2, hd: CONSOLE.len / 2, rot: 0, top: CONSOLE.h },
    { x: wallX - CONSOLE.d / 2, z, hw: CONSOLE.d / 2, hd: CONSOLE.len / 2, rot: 0, top: CONSOLE.h },
  ]);
}

/** 바닥에 놓인 상자 하나의 충돌 (중심 x·z, 폭·깊이·높이) */
export function boxCollider(x: number, z: number, w: number, d: number, h: number, rot = 0): Collider {
  return { x, z, hw: w / 2, hd: d / 2, rot, top: h };
}

/**
 * 방 하나를 `<group position rotation-y>` 안에 세웠을 때의 충돌 — 그 그룹 변환을 충돌 상자에도 건다.
 * 꺾인 복도의 둘째 다리가 쓴다: 그리는 것은 그룹이 돌려 주지만, 충돌은 월드 좌표라 손으로 옮겨야 한다.
 * 회전 규약은 three 의 rotation.y 와 같다 (collide.ts 의 toLocal 이 그 역회전이다).
 */
export function placeColliders(colliders: readonly Collider[], at: { x: number; z: number; rot: number }): Collider[] {
  const cos = Math.cos(at.rot);
  const sin = Math.sin(at.rot);
  return colliders.map((c) => ({
    ...c,
    x: at.x + c.x * cos + c.z * sin,
    z: at.z - c.x * sin + c.z * cos,
    rot: c.rot + at.rot,
  }));
}

/** 한쪽 벽의 것만 남긴다 — 키트 배치 함수는 늘 양쪽에 달지만, 그림이 걸릴 벽은 비워야 한다 */
export function onSide<T extends { position: readonly [number, number, number] }>(items: readonly T[], side: -1 | 1): T[] {
  return items.filter((it) => Math.sign(it.position[0]) === side);
}

export function keepSide(set: TubeSet, side: -1 | 1): TubeSet {
  return { bezels: onSide(set.bezels, side), tubes: onSide(set.tubes, side) };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
