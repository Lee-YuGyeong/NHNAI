/**
 * 재검실(/recheck) — **치수·배치·충돌의 단일 출처.** recheck.tsx(그리기)가 여기 숫자로 부품을 늘어놓는다.
 *
 * 챕터 3 의 무대다. 검문에서 감독(src/lab/director.ts)이 `detain` 을 고르면 대본에서 이탈해 여기로 끌려온다.
 * 그래서 이 방은 **작고 비어 있다** — 나갈 문은 등 뒤 하나뿐이고 그 문은 닫혀 있다. 앞에는 검증대와 조명 하나,
 * 그 아래 바닥 표식. 여기서 일어나는 일에는 대본이 없다: 묻는 것도 판정도 다음 장면도 전부 감독이 그 자리에서 정한다.
 * 볼 것을 줄인 것은 절제가 아니라 설계다 — 이 방에서 플레이어가 볼 것은 **자기가 무슨 말을 했는가**뿐이어야 한다.
 *
 * 8각 셸·리브·튜브·콘솔은 전부 공용 키트(map/scifi.tsx) — 복도·중앙 시설과 같은 문법이다. 여기서 정하는 건 치수와
 * 끝벽의 내용(검증대·화면·링 조명)뿐이다. 꾸미는 것은 나중에 얹는다 (2026-08-30 사용자: "중간에 맵을 꾸미던가 할게").
 *
 * 좌표계: 길이 방향 z (먼 끝벽 -10 · 들어온 벽 6), 벽 안쪽 면 x = ±6, 바닥 0, 수직 벽 3.4, 천장 5.6.
 * 서버 WORLD(mp/constants.ts, x ±14.4 · z -23.4~15.4) 안에 넉넉히 든다.
 * 스폰 원(중심 (0,-2.5) 반지름 3.4 — z -5.9~0.9) 위에는 아무것도 놓지 않는다: 콘솔 bay 에서 -4·0 을 비운 이유다.
 *
 * three.js 를 끌어오지 않는 순수 파일이다 — 충돌 목록(COLLIDERS)이 mp/collide.ts 의 순수 함수로 그대로 들어간다.
 */

import type { Collider } from '../../mp/collide';
import { CONSOLE, metrics, type Profile, type RibSpec } from '../scifi';

/* ─────────────────────────────── 방 뼈대 (8각 단면) ─────────────────────────────── */

export const WALL_X = 6;
export const FAR_Z = -10;
export const NEAR_Z = 6;
export const WALL_TOP_Y = 3.4;
export const CEILING_Y = 5.6;

/** 8각 단면 — 45° 가 되도록 천장 반폭 = 벽 x − (천장 − 수직 벽 끝) */
export const PROFILE: Profile = {
  wallX: WALL_X,
  wallTopY: WALL_TOP_Y,
  ceilingY: CEILING_Y,
  ceilHalf: WALL_X - (CEILING_Y - WALL_TOP_Y),
  farZ: FAR_Z,
  nearZ: NEAR_Z,
};
export const M = metrics(PROFILE);
export const MID_Z = (FAR_Z + NEAR_Z) / 2;

/** 부품 사이 최소 여유(m) — 붙이면 깊이 다툼이 나고, 벌리면 틈이 보인다 */
export const GAP = 0.02;

/* ─────────────────────────────── bay · 리브 ─────────────────────────────── */

/** bay 길이 4 — 16m 를 4칸 */
export const BAY_CENTERS = [-8, -4, 0, 4] as const;
export const RIB_ZS = [-6, -2, 2] as const;
export const RIB: RibSpec = { d: 0.4, t: 0.7, bevel: 0.03 };
/** 콘솔이 놓이는 bay — 스폰 원(-5.9~0.9) 옆 -4·0 은 비운다 */
export const CONSOLE_BAYS = [-8, 4] as const;

/* ─────────────────────────────── 끝벽 — 검증대 ─────────────────────────────── */

/**
 * 검증대 — 먼 끝벽 앞의 낮은 대. 심문하는 쪽이 이 뒤에 선다.
 * 앞면 z −7.9 는 스폰 원(−5.9 까지)에서 2m 앞이라 들어오자마자 몸이 끼지 않는다
 */
export const DESK = { x: 0, z: -8.4, w: 3.2, d: 1, h: 0.95 } as const;
/** 검증대 위 발광 띠 — 무광 강판에서 대의 턱이 안 읽힌다 (심문소 무대 STAGE_STRIP 과 같은 생각) */
export const DESK_STRIP = { h: 0.05, lift: 0.012 } as const;
/** 끝벽 데이터 화면 셋 — 검증대 위. x 는 좌·중·우 */
export const WALL_SCREENS = { xs: [-1.9, 0, 1.9] as const, y: 2.3, w: 1.3, h: 0.8 } as const;

/* ─────────────────────────────── 검증 자리 ─────────────────────────────── */

/** 서야 하는 자리 — 바닥 표식과 링 조명이 여기 겹친다. 스폰(0,−2.5)에서 2m 앞이다 */
export const SPOT = { x: 0, z: -4.5 } as const;
export const MARK = { r: 1.1, ring: 0.08 } as const;
/** 자리 위 링 조명 — 기구는 GLB(ring_lamp), 빛기둥·발광 테는 recheck.tsx 가 그린다 */
export const LAMP = { y: 4.5, r: 0.9, tube: 0.07 } as const;

/* ─────────────────────────────── 들어온 문 ─────────────────────────────── */

/** 격벽 링(Tripo sci_bulkhead) — 복도와 같은 규격. 균등 배율이라야 45° 챔퍼가 산다 */
export const RING_SCALE = 6;
export const RING = { scale: RING_SCALE, sink: 0.12 * RING_SCALE, thickness: 0.9 } as const;
/** 격납문 — 등 뒤 하나뿐이고 **열리지 않는다**. 나가는 길은 감독이 정한다 */
export const DOOR = { w: 3.6, h: 3.7, depth: 0.35 } as const;

/* ─────────────────────────────── 조명 자리 ─────────────────────────────── */

/** bay 마다 차가운 점광원 — 벽·리브에 형태를 준다 */
export const BAY_LIGHT = { y: CEILING_Y - 2.4, intensity: 11, distance: 12 } as const;
/** 검증대 위 광원 — 끝벽과 대를 비춘다 */
export const DESK_LIGHT = { y: 3.2, z: DESK.z + 1.4, intensity: 9, distance: 9 } as const;
/** 링 조명이 내리는 빛 — 서야 하는 자리에만 떨어진다 */
export const SPOT_LIGHT = { y: LAMP.y - 0.2, intensity: 16, distance: 8 } as const;

/* ─────────────────────────────── 시선 초점 ─────────────────────────────── */

/** 들어오면 검증대를 보고 시작한다 (WorldScene 의 LocalRig) */
export const FOCUS = { x: DESK.x, y: 1.6, z: DESK.z } as const;

/* ─────────────────────────────── 충돌 ─────────────────────────────── */

const WALL_T = 1;
const WALL_TOP = 6;

/** 순서: 벽 4 → 검증대 1 → 리브 6 → 옆벽 콘솔 4 */
export const COLLIDERS: readonly Collider[] = [
  { x: -(WALL_X + WALL_T / 2), z: MID_Z, hw: WALL_T / 2, hd: (NEAR_Z - FAR_Z) / 2 + 1, rot: 0, top: WALL_TOP },
  { x: WALL_X + WALL_T / 2, z: MID_Z, hw: WALL_T / 2, hd: (NEAR_Z - FAR_Z) / 2 + 1, rot: 0, top: WALL_TOP },
  { x: 0, z: FAR_Z - WALL_T / 2, hw: WALL_X + 1, hd: WALL_T / 2, rot: 0, top: WALL_TOP },
  { x: 0, z: NEAR_Z + WALL_T / 2, hw: WALL_X + 1, hd: WALL_T / 2, rot: 0, top: WALL_TOP },
  { x: DESK.x, z: DESK.z, hw: DESK.w / 2, hd: DESK.d / 2, rot: 0, top: DESK.h },
  ...RIB_ZS.flatMap((z) => [
    { x: -(WALL_X - RIB.d / 2), z, hw: RIB.d / 2, hd: RIB.t / 2, rot: 0, top: WALL_TOP },
    { x: WALL_X - RIB.d / 2, z, hw: RIB.d / 2, hd: RIB.t / 2, rot: 0, top: WALL_TOP },
  ]),
  ...CONSOLE_BAYS.flatMap((z) => [
    { x: -(WALL_X - CONSOLE.d / 2), z, hw: CONSOLE.d / 2, hd: CONSOLE.len / 2, rot: 0, top: CONSOLE.h },
    { x: WALL_X - CONSOLE.d / 2, z, hw: CONSOLE.d / 2, hd: CONSOLE.len / 2, rot: 0, top: CONSOLE.h },
  ]),
];
