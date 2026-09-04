/**
 * 벽·가구 충돌 — **순수 함수.**
 *
 * 클라이언트(src/world/map/corridor.tsx)가 읽고, 워커도 읽을 수 있게 three.js·DOM 타입을
 * 끌어오지 않는다. (THREE.Vector3 를 받는 래퍼는 corridor.tsx 가 얇게 감싼다.)
 */

/** 플레이어 몸통 반지름 — 이만큼 가구에서 밀려난다 */
export const PLAYER_R = 0.35;

/** 이보다 낮은 턱은 막지 않고 그냥 지나간다 (낮은 탁자). */
export const STEP_UP = 0.55;

/**
 * 충돌용 회전 박스(footprint). map/corridor/layout.ts 의 배치를 그대로 옮겼다 — 워커도 읽는 파일이라
 * 거기서 import 하지 못하고 숫자를 베낀다. **layout.ts 를 고치면 여기도 같이 고친다.**
 * hw/hd 는 반폭·반깊이. top 은 윗면 높이.
 */
export interface Collider {
  x: number;
  z: number;
  hw: number;
  hd: number;
  rot: number;
  top: number;
}

/* layout.ts 와 같은 값 */
/** 벽 안쪽 면 x (= layout WALL_X) — SF 복도(2026-08-29)는 ±5, z -22~14 */
const WALL_X = 5;
const FAR_Z = -22;
const NEAR_Z = 14;
/** 벽 두께. 넉넉히 — 반대편은 어차피 WORLD 가 자른다 */
const WALL_T = 1;
/** 벽 top — 점프 최고점(≈1.05)보다 훨씬 위라 절대 못 넘는다 */
const WALL_TOP = 6;

/** 격벽 리브 (= layout RIB.d / RIB.t / RIB_ZS) — 벽에서 0.4 나온 두께 0.7 의 아치 다리 */
const RIB_X = WALL_X - 0.2;
const RIB_HW = 0.2;
const RIB_HD = 0.35;
const RIB_ZS = [-18, -14, -10, -6, -2, 2, 6, 10];
/** 발치 콘솔 (= layout CONSOLE_X · CONSOLE(길이 2.4, 깊이 0.7, 높이 0.85) · CONSOLE_BAYS). top 0.85 는 점프(≈1.05)로 올라설 수 있다 */
const CONSOLE_X = 4.65;
const CONSOLE_ZS = [-20, -16, -12, -8, 4, 8, 12];
const CONSOLE_HW = 0.35;
const CONSOLE_HD = 1.2;
const CONSOLE_TOP = 0.85;

/** 걸어다닐 수 있는 안쪽 영역 — 벽 안쪽 면까지. lab/corridor-objects.ts (리더 카탈로그)가 읽는다 */
export const BOUNDS = { minX: -WALL_X, maxX: WALL_X, minZ: FAR_Z, maxZ: NEAR_Z } as const;

/**
 * ★ 스폰 원(중심 (0,-2.5) 반지름 3.4 → |x| ≤ 3.4, z -5.9~0.9) 위에는 아무것도 없다.
 *   가장 가까운 것이 리브 안쪽 면 4.6 − PLAYER_R 에서 막고, 콘솔은 bay -4·0 에 없다.
 * ★ 종류별로 묶여 순서대로 들어 있다: 벽 4 → 리브 16 → 콘솔 14.
 *   lab/corridor-objects.ts 가 이 순서로 읽는다 — 그룹을 늘리거나 순서를 바꾸면 거기도 같이 고친다.
 */
export const COLLIDERS: readonly Collider[] = [
  // 양쪽 벽 (x = ±5 바깥으로 두께 WALL_T)
  { x: -(WALL_X + WALL_T / 2), z: (FAR_Z + NEAR_Z) / 2, hw: WALL_T / 2, hd: (NEAR_Z - FAR_Z) / 2 + 1, rot: 0, top: WALL_TOP },
  { x: WALL_X + WALL_T / 2, z: (FAR_Z + NEAR_Z) / 2, hw: WALL_T / 2, hd: (NEAR_Z - FAR_Z) / 2 + 1, rot: 0, top: WALL_TOP },
  // 끝벽 두 개 (격벽 링·격납문은 벽면에 붙어 있어 이 안에 든다)
  { x: 0, z: FAR_Z - WALL_T / 2, hw: WALL_X + 1, hd: WALL_T / 2, rot: 0, top: WALL_TOP },
  { x: 0, z: NEAR_Z + WALL_T / 2, hw: WALL_X + 1, hd: WALL_T / 2, rot: 0, top: WALL_TOP },
  // 격벽 리브 — 벽에서 0.4 튀어나온 아치 다리, 양쪽 각각
  ...RIB_ZS.flatMap((z) => [
    { x: -RIB_X, z, hw: RIB_HW, hd: RIB_HD, rot: 0, top: WALL_TOP },
    { x: RIB_X, z, hw: RIB_HW, hd: RIB_HD, rot: 0, top: WALL_TOP },
  ]),
  // 발치 콘솔 (긴 변이 벽을 따라간다) — 올라설 수 있다
  ...CONSOLE_ZS.flatMap((z) => [
    { x: -CONSOLE_X, z, hw: CONSOLE_HW, hd: CONSOLE_HD, rot: 0, top: CONSOLE_TOP },
    { x: CONSOLE_X, z, hw: CONSOLE_HW, hd: CONSOLE_HD, rot: 0, top: CONSOLE_TOP },
  ]),
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
  /** 맵의 충돌 박스. 기본은 복도(COLLIDERS) — 다른 맵은 자기 목록을 넘긴다 (map/warehouse/layout.ts) */
  colliders: readonly Collider[] = COLLIDERS,
): { x: number; z: number } {
  let px = x;
  let pz = z;

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let pushed = false;

    for (const c of colliders) {
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
export function groundHeightAt(x: number, z: number, fromY: number, colliders: readonly Collider[] = COLLIDERS): number {
  let ground = 0;
  for (const c of colliders) {
    if (c.top > fromY + 0.02) continue;
    if (c.top <= ground) continue;
    const [lx, lz] = toLocal(c, x, z);
    if (Math.abs(lx) > c.hw || Math.abs(lz) > c.hd) continue;
    ground = c.top;
  }
  return ground;
}
