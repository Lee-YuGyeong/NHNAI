/**
 * 중앙 시설(/central) — **치수·배치·충돌의 단일 출처.** central.tsx(그리기)가 여기 숫자로 부품을 늘어놓는다.
 *
 * 챕터 1 의 마지막 무대: 복도 끝 격납문이 열리면 여기로 온다. 복도와 같은 8각 강판 셸을 크게(30×28, 천장 10) —
 * 한가운데 원형 단(dais) 위에 발광 링을 두른 **코어 기둥**이 천장까지 서 있고, 그 둘레를 AI 들이 오간다.
 * 양 끝에 격납문(들어온 문·나가는 문) + 격벽 링. 옆벽은 리브·콘솔·튜브(공용 키트).
 *
 * 좌표계: 길이 방향 z (먼 끝벽 -18 · 들어온 벽 10), 벽 안쪽 면 x = ±14, 바닥 0, 수직 벽 6, 천장 10.
 * 서버 WORLD(x ±14.4 · z -23.4~15.4) 안이다. 스폰 원(중심 (0,-2.5) 반지름 3.4 — WORLD 로 정해져 못 옮긴다)은 단 앞 빈 바닥 — 단(DAIS)과 안 겹친다.
 *
 * three.js 를 끌어오지 않는 순수 파일이다 — 충돌 목록(COLLIDERS)이 mp/collide.ts 의 순수 함수로 그대로 들어간다.
 */

import type { Collider } from '../../mp/collide';

/* ─────────────────────────────── 홀 뼈대 (8각 단면) ─────────────────────────────── */

export const WALL_X = 14;
/**
 * 홀의 길이 방향 — **코어가 가운데 오도록 잡은 값이다** (2026-08-30 사용자: "코어가 문쪽이랑 너무 가까워, 맵 중앙에").
 *
 * 코어(DAIS)는 옮길 수 없다. 좌석 원(mp/spawn.ts, 중심 (0,−2.5) 반지름 3.4)이 **서버와 공유하는 상수**라 맵마다 못 바꾸는데,
 * 단(r 4.5)이 거기 안 겹치려면 z ≤ −10.4 여야 한다 — 지금 −10.5 가 이미 한계다. 겹치면 스폰하자마자 단 위에 서서 락다운이 즉시 터진다.
 * 그래서 **코어를 옮기는 대신 홀을 다시 잡았다**: 먼 벽 −18 → −22, 들어온 벽 10 → 4.
 * 홀 중심이 −4 → −9 가 되어 코어(−10.5)가 사실상 정중앙에 서고, 코어 뒤 통로가 3m → 7m 로 늘었다.
 */
export const FAR_Z = -22;
export const NEAR_Z = 4;
export const WALL_TOP_Y = 6;
export const CEILING_Y = 10;
export const CEIL_HALF = WALL_X - (CEILING_Y - WALL_TOP_Y);
export const PROFILE = { wallX: WALL_X, wallTopY: WALL_TOP_Y, ceilingY: CEILING_Y, ceilHalf: CEIL_HALF, farZ: FAR_Z, nearZ: NEAR_Z } as const;
export const MID_Z = (FAR_Z + NEAR_Z) / 2;

/** bay 길이 4 — 26m 중 24m 를 6칸. 남는 2m(z 2~4)는 들어온 문의 격벽 링 자리다 */
export const BAY_CENTERS = [-20, -16, -12, -8, -4, 0] as const;
export const RIB_ZS = [-18, -14, -10, -6, -2, 2] as const;
export const RIB = { d: 0.7, t: 1.1, bevel: 0.04 } as const;
export const CONSOLE_BAYS = BAY_CENTERS;
const CONSOLE_D = 0.7;
const CONSOLE_LEN = 2.4;
const CONSOLE_H = 0.85;

/* ─────────────────────────────── 코어 ─────────────────────────────── */

/**
 * 원형 단 — 안쪽으로 물러선 자리. h 0.5 ≤ STEP_UP 이라 걸어 오른다.
 * r 4.5 · z -10.5: 뒤 가장자리 -15 라 먼 문(검증실, z -22)까지 7m 통로가 남고(r 6 · z -11.5 땐 문을 막았다 — 2026-08-30),
 * 앞 가장자리 -6 은 스폰 원(z -5.9 까지) 바로 앞이다. 코어 트리거는 단 위에 올라섰을 때(CentralChapterScene)라 스폰과 안 겹친다.
 * 챕터 2 의 줄(z -15.6, x < -4.4)·검증실 문 앞(-2.2, -17.2)·경비 자리(±2.6, -16.3)는 다 단 밖이다
 */
export const DAIS = { x: 0, z: -10.5, r: 4.5, h: 0.5 } as const;
/** 코어 탑 몸통 반지름 (8각) */
export const CORE = { r: 1.5 } as const;
/**
 * 코어 우회 구역 — **걸어다니는 몸(경비·줄에 선 넷)이 이 원 밖으로 돌아간다** (features/world/walk.ts).
 * 코어 충돌은 받침 박스 둘(hw 3.8, 하나는 45°)이 겹친 팔각이라 외접 반경이 3.8√2 ≈ 5.37 —
 * 거기에 몸 반지름(0.42)과 여유를 더한 값이다. 검문 자리(z 2.4)·재배치 자리(z −18~−20)·줄(z −19.6)·궤도 순찰(r 7.5)은 다 이 밖이라
 * 목표를 삼키지 않는다. 이게 없으면 문 앞으로 가는 직선이 코어를 관통해 몸이 코어에 붙어 제자리 걸음을 했다 (2026-08-31 사용자)
 */
export const CORE_KEEPOUT = { x: DAIS.x, z: DAIS.z, r: 5.9 } as const;
/**
 * 코어 탑 (참고 이미지, 2026-08-29): 단 위 받침(baseTop 까지) → 층마다 8각 칼라(tierGap 간격, collarH 두께)와 네 면 홀로 스크린 →
 * 꼭대기 링. 받침 둘레엔 기울어진 콘솔 화면 6장(consoleR 원 위, 화면 중심 높이 consoleY)과 그 앞 발광 난간(railH)
 */
export const TOWER = { baseTop: 2.0, tiers: 4, tierGap: 1.85, collarH: 0.45, consoleR: 3.3, consoleY: 1.05, railH: 0.95 } as const;

/* ─────────────────────────────── 문 ─────────────────────────────── */

export const RING_SCALE = 6;
export const RING = { scale: RING_SCALE, sink: 0.12 * RING_SCALE, thickness: 0.9 } as const;
export const DOOR = { w: 3.6, h: 3.7, depth: 0.35 } as const;

/* ─────────────────────────────── 조명 자리 ─────────────────────────────── */

export const BAY_LIGHT = { y: CEILING_Y - 4, intensity: 34, distance: 20 } as const;
/** 코어 빛 — 기둥 위아래 두 점 */
export const CORE_LIGHT = { intensity: 40, distance: 18 } as const;

/* ─────────────────────────────── 시선 초점 ─────────────────────────────── */

export const FOCUS = { x: 0, y: 3, z: DAIS.z } as const;

/* ─────────────────────────────── 충돌 ─────────────────────────────── */

const WALL_T = 1;
const WALL_TOP = 6;

/** 순서: 벽 4 → 단 1 → 코어 1 → 리브 12 → 콘솔 14. 단은 원이지만 충돌은 정사각(반폭 r×0.85) — 모서리는 비어 보이지만 낮아서 티가 안 난다 */
export const COLLIDERS: readonly Collider[] = [
  { x: -(WALL_X + WALL_T / 2), z: MID_Z, hw: WALL_T / 2, hd: (NEAR_Z - FAR_Z) / 2 + 1, rot: 0, top: WALL_TOP },
  { x: WALL_X + WALL_T / 2, z: MID_Z, hw: WALL_T / 2, hd: (NEAR_Z - FAR_Z) / 2 + 1, rot: 0, top: WALL_TOP },
  { x: 0, z: FAR_Z - WALL_T / 2, hw: WALL_X + 1, hd: WALL_T / 2, rot: 0, top: WALL_TOP },
  { x: 0, z: NEAR_Z + WALL_T / 2, hw: WALL_X + 1, hd: WALL_T / 2, rot: 0, top: WALL_TOP },
  { x: DAIS.x, z: DAIS.z, hw: DAIS.r * 0.85, hd: DAIS.r * 0.85, rot: Math.PI / 4, top: DAIS.h },
  // 받침 + 콘솔 링 — 콘솔 화면 바깥까지 통째로 막는다 (탑 밑으로 못 들어간다)
  { x: DAIS.x, z: DAIS.z, hw: TOWER.consoleR + 0.5, hd: TOWER.consoleR + 0.5, rot: 0, top: WALL_TOP },
  { x: DAIS.x, z: DAIS.z, hw: TOWER.consoleR + 0.5, hd: TOWER.consoleR + 0.5, rot: Math.PI / 4, top: WALL_TOP },
  ...RIB_ZS.flatMap((z) => [
    { x: -(WALL_X - RIB.d / 2), z, hw: RIB.d / 2, hd: RIB.t / 2, rot: 0, top: WALL_TOP },
    { x: WALL_X - RIB.d / 2, z, hw: RIB.d / 2, hd: RIB.t / 2, rot: 0, top: WALL_TOP },
  ]),
  ...CONSOLE_BAYS.flatMap((z) => [
    { x: -(WALL_X - CONSOLE_D / 2), z, hw: CONSOLE_D / 2, hd: CONSOLE_LEN / 2, rot: 0, top: CONSOLE_H },
    { x: WALL_X - CONSOLE_D / 2, z, hw: CONSOLE_D / 2, hd: CONSOLE_LEN / 2, rot: 0, top: CONSOLE_H },
  ]),
];
