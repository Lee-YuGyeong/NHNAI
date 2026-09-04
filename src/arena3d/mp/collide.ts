/**
 * 가구 충돌 — **순수 함수.**
 *
 * 클라이언트(src/world/map/warehouse.tsx)가 읽고, 워커도 읽을 수 있게 three.js·DOM 타입을
 * 끌어오지 않는다. (THREE.Vector3 를 받는 래퍼는 warehouse.tsx 가 얇게 감싼다.)
 */

import { WALL_INSET, WORLD } from './constants';

/** 창고 반폭. warehouse.tsx 의 ROOM.width/2 와 같은 값이다 — WORLD 에서 되돌려 쓴다. */
const HALF_W = WORLD.maxX + WALL_INSET;

/** 플레이어 몸통 반지름 — 이만큼 가구에서 밀려난다 */
export const PLAYER_R = 0.35;

/** 이보다 낮은 턱은 막지 않고 그냥 지나간다 (낮은 탁자). */
export const STEP_UP = 0.55;

/**
 * 가구 충돌용 회전 박스(footprint). Warehouse()·Furniture() 배치를 그대로 옮겼다.
 * 거기 좌표를 고치면 여기도 같이 고친다. hw/hd 는 반폭·반깊이. top 은 윗면 높이.
 */
export interface Collider {
  x: number;
  z: number;
  hw: number;
  hd: number;
  rot: number;
  top: number;
}

export const COLLIDERS: readonly Collider[] = [
  // 소파 (팔걸이 포함 폭 / 등받이 윗면)
  { x: -4.4, z: -8.2, hw: 1.5, hd: 0.62, rot: 0.12, top: 0.99 },
  { x: 0.2, z: -7.4, hw: 1.5, hd: 0.62, rot: 0, top: 0.99 },
  { x: 4.8, z: -8, hw: 1.5, hd: 0.62, rot: -0.12, top: 0.99 },
  { x: -7.8, z: -6.6, hw: 1.5, hd: 0.62, rot: 0.5, top: 0.99 },
  { x: 7.9, z: -6.4, hw: 1.5, hd: 0.62, rot: -0.5, top: 0.99 },
  // 낮은 탁자 (STEP_UP 아래 — 걸어서 올라간다)
  { x: -4.2, z: -6.7, hw: 0.9, hd: 0.5, rot: 0, top: 0.5 },
  { x: 0.4, z: -5.9, hw: 0.9, hd: 0.5, rot: 0, top: 0.5 },
  { x: 4.7, z: -6.5, hw: 0.75, hd: 0.5, rot: 0, top: 0.5 },
  // 식탁 세트 (의자까지 한 덩어리 / 상판 윗면)
  { x: -7.6, z: -1.6, hw: 0.8, hd: 1.3, rot: 0.15, top: 0.81 },
  { x: -6.9, z: 3, hw: 0.8, hd: 1.3, rot: -0.2, top: 0.81 },
  { x: 0.1, z: 1.4, hw: 0.8, hd: 1.3, rot: 0.05, top: 0.81 },
  { x: 7.2, z: -1.9, hw: 0.8, hd: 1.3, rot: -0.12, top: 0.81 },
  { x: 6.6, z: 3.1, hw: 0.8, hd: 1.3, rot: 0.25, top: 0.81 },
  // 좌우 벽의 랙 (90° 돌아간 것만 — 스크린 옆 랙은 이동 한계 밖이다)
  { x: -(HALF_W - 0.75), z: -8.5, hw: 0.55, hd: 1.45, rot: 0, top: 4.4 },
  { x: HALF_W - 0.75, z: -8.5, hw: 0.55, hd: 1.45, rot: 0, top: 4.4 },
  { x: -(HALF_W - 0.75), z: -4.8, hw: 0.55, hd: 1.45, rot: 0, top: 4.4 },
  { x: HALF_W - 0.75, z: -4.8, hw: 0.55, hd: 1.45, rot: 0, top: 4.4 },
  // 장비 케이스
  { x: HALF_W - 1.3, z: 1.6, hw: 0.7, hd: 0.45, rot: 0, top: 1.3 },
  { x: HALF_W - 1.2, z: 3.2, hw: 0.55, hd: 0.45, rot: 0, top: 0.9 },
  { x: HALF_W - 2.6, z: 2.4, hw: 0.5, hd: 0.45, rot: 0, top: 1.05 },
  { x: -HALF_W + 1.3, z: 2.2, hw: 0.65, hd: 0.45, rot: 0, top: 1.15 },
];

/** 월드 좌표를 가구 로컬(rotation-y 역회전)로 옮긴다. */
function toLocal(c: Collider, x: number, z: number): [number, number] {
  const cos = Math.cos(c.rot);
  const sin = Math.sin(c.rot);
  const dx = x - c.x;
  const dz = z - c.z;
  return [dx * cos - dz * sin, dx * sin + dz * cos];
}

/** 이 가구가 지금 발 높이에서 막는가. */
function blocks(c: Collider, feetY: number, stepUp: number): boolean {
  if (feetY >= c.top - 0.02) return false; // 윗면보다 높이 있으면 통과
  if (c.top - feetY <= stepUp) return false; // 낮은 턱은 그냥 넘어간다
  return true;
}

/** 밀어내기 반복 횟수. 맞닿은 가구 사이에 끼는 걸 막는다. */
const MAX_PASSES = 4;

/** 겹쳤으면 얕게 파고든 축으로 밀어낸다. 순수 — 새 좌표를 돌려준다. */
export function resolveCollisions(
  x: number,
  z: number,
  feetY: number,
  stepUp: number = STEP_UP,
): { x: number; z: number } {
  let px = x;
  let pz = z;

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let pushed = false;

    for (const c of COLLIDERS) {
      if (!blocks(c, feetY, stepUp)) continue;
      const [lx0, lz0] = toLocal(c, px, pz);
      let lx = lx0;
      let lz = lz0;
      const ex = c.hw + PLAYER_R;
      const ez = c.hd + PLAYER_R;
      if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) continue;
      if (ex - Math.abs(lx) < ez - Math.abs(lz)) {
        lx = Math.sign(lx || 1) * ex;
      } else {
        lz = Math.sign(lz || 1) * ez;
      }
      const cos = Math.cos(c.rot);
      const sin = Math.sin(c.rot);
      px = c.x + lx * cos + lz * sin;
      pz = c.z - lx * sin + lz * cos;
      pushed = true;
    }

    if (!pushed) break;
  }

  return { x: px, z: pz };
}

/**
 * (x, z)에서 발이 닿을 높이. 바닥은 0, 가구 위에 서 있으면 그 윗면이다.
 * `fromY`는 판정 직전의 발 높이 — 이보다 높은 윗면은 후보에서 뺀다.
 */
export function groundHeightAt(x: number, z: number, fromY: number): number {
  let ground = 0;
  for (const c of COLLIDERS) {
    if (c.top > fromY + 0.02) continue;
    if (c.top <= ground) continue;
    const [lx, lz] = toLocal(c, x, z);
    if (Math.abs(lx) > c.hw || Math.abs(lz) > c.hd) continue;
    ground = c.top;
  }
  return ground;
}
