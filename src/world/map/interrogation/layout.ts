/**
 * 3D 디지털 심문소 — **치수·배치·충돌의 단일 출처.** interrogation.tsx(그리기)가 여기 숫자로 부품을 늘어놓는다.
 *
 * 참고 이미지: 검정 철골 박공 트러스 천장 · 검푸른 강판 벽 · 무광 검정 타일 바닥에 청색 발광 격자선(교차점에 점광)
 * · 끝벽 가운데 낮은 단(무대), 천장 링 조명이 무대 가운데만 비춘다 (의자는 뺐다) · 단 뒤 넓은 관찰창(어두운 유리, 안쪽 관제실)
 * · 창 양옆 청색 모니터 2×2 · 그 바깥 세로 LED 바 패널 · 옆벽 X 가새 강판 문 · 앞쪽 양옆 금속 케이스 선반(선반 밑 청색 LED)
 * · 벽 위·아래 가장자리 청색 LED 띠 · 등 뒤 벽의 격벽 링과 격납문(복도·창고와 같은 부품).
 *
 * 좌표계: 길이 방향 z (무대벽 -20 · 등 뒤 벽 12), 벽 안쪽 면 x = ±15, 바닥 0, 처마 9, 용마루 13.
 * 발자국이 창고 맵(warehouse/layout.ts)과 같아 서버가 검증하는 WORLD(mp/constants.ts)를 그대로 쓴다 — **여기를 넓히면 WORLD 도 같이 고친다.**
 * 스폰 원(중심 (0,-2.5) 반지름 3.4) 위에는 아무것도 놓지 않는다.
 *
 * three.js 를 끌어오지 않는 순수 파일이다 — 충돌 목록(COLLIDERS)이 mp/collide.ts 의 순수 함수로 그대로 들어간다.
 */

import type { Collider } from '../../mp/collide';

/* ─────────────────────────────── 건물 뼈대 ─────────────────────────────── */

export const ROOM = { width: 30, back: -20, front: 12, eave: 9, ridge: 13 } as const;
export const HALF_W = ROOM.width / 2;
export const DEPTH = ROOM.front - ROOM.back;
export const MID_Z = (ROOM.front + ROOM.back) / 2;
export const RISE = ROOM.ridge - ROOM.eave;
export const SLOPE_ANGLE = Math.atan2(RISE, HALF_W);
export const SLOPE_LEN = Math.hypot(HALF_W, RISE);

/** 트러스 z — 4.6m 간격 7개 */
export const TRUSS_ZS = [-18, -13.4, -8.8, -4.2, 0.4, 5, 9.6] as const;
export const TRUSS = { thickness: 0.3 } as const;
/** 경사면 위 중도리 — 처마에서 용마루까지의 비율 위치 */
export const PURLIN_TS = [0.3, 0.62, 0.9] as const;

/** 옆벽 기둥 z — 4.5m bay 7칸. 짝수 bay 에 X 가새 문, 홀수 bay 에 선반 */
export const COLUMN_ZS = [-19.6, -15.1, -10.6, -6.1, -1.6, 2.9, 7.4, 11.9] as const;
export const COLUMN = { w: 0.24, d: 0.22 } as const;
export const BRACE_BAYS: readonly (readonly [number, number])[] = [
  [COLUMN_ZS[0], COLUMN_ZS[1]],
  [COLUMN_ZS[2], COLUMN_ZS[3]],
  [COLUMN_ZS[4], COLUMN_ZS[5]],
  [COLUMN_ZS[6], COLUMN_ZS[7]],
];

/* ─────────────────────────────── 바닥 격자 ─────────────────────────────── */

/** 타일 한 변. 텍스처 한 장 = 정확히 1타일(가장자리에 줄눈 반쪽씩)이라 반복 = 길이 / TILE, 줄눈이 -15·-20 부터 TILE 마다 온다. 격자선은 그 위 */
export const TILE = 2.5;
/** 배수구가 놓이는 z (5m 마다 줄눈 위). 바닥 발광 격자선은 뺐다 — 사용자 결정 2026-08-28, 타일 줄눈만 남긴다 */
export const GRID_ZS = [-12.5, -7.5, -2.5, 2.5, 7.5] as const;
/** 바닥 배수구 — 옆벽 앞 줄눈 위. w 는 z 방향 길이 */
export const GRATE = { x: 13.75, w: 0.8, d: 0.36, h: 0.03 } as const;

/* ─────────────────────────────── 무대 · 의자 ─────────────────────────────── */

/** 낮은 단. top 0.45 < STEP_UP(0.55) 이라 걸어 올라간다 */
export const STAGE = { w: 20, h: 0.45, d: 6 } as const;
export const STAGE_Z = ROOM.back + STAGE.d / 2;
/** 무대 앞면 z — 발광 띠가 붙는 면 */
export const STAGE_FRONT_Z = ROOM.back + STAGE.d;
/** 무대 앞면·옆면 발광 띠 (창고 맵 STAGE_STRIP 과 같은 생각) — 무광 검정 바닥에서 무대 턱이 안 읽혀 헛디딘다. y 는 앞면 중간 */
export const STAGE_STRIP = { y: STAGE.h / 2, h: 0.05, d: 0.03 } as const;
/** 무대 윗면 원형 표식 — 링 조명 바로 아래. 빛 웅덩이에 테를 둘러 「여기가 심문 자리」가 된다 (창고 맵 STAGE_MARK) */
export const STAGE_MARK = { r: 1.9, ring: 0.07 } as const;

/** 무대 가운데 — 링 조명·스포트가 떨어지는 점. (심문 의자는 뺐다 — 사용자 결정 2026-08-28, 빈 무대에 빛만 떨어진다) */
export const SPOT = { x: 0, z: STAGE_Z - 0.2 } as const;

/** 시선 초점 — 무대 가운데 빛 웅덩이 조금 위. **들어오면 이 점을 보고 시작한다** */
export const FOCUS = { x: SPOT.x, y: 1.2, z: SPOT.z } as const;

/** 의자 위 링 조명 — 처마 높이의 가로 빔에서 봉으로 매달린다 */
export const RING = { y: 7.4, r: 0.9, tube: 0.07, beamY: ROOM.eave + 0.2 } as const;

/* ─────────────────────────────── 끝벽 ─────────────────────────────── */

/** 관찰창 — 무대 뒤 끝벽. y 는 아랫변. 참고 렌더처럼 네 모서리를 chamfer 만큼 깎은 8각, 프레임은 frame 폭·depth 돌출 */
export const WINDOW = { w: 12, h: 3.0, y: 3.3, frame: 0.34, chamfer: 0.55, depth: 0.32 } as const;
/** 창 양옆 모니터 2×2 — 클러스터 중심 x, 화면 하나의 크기, 칸 간격 */
export const SCREENS = { cx: 9.6, w: 1.5, h: 1.05, gapX: 0.22, gapY: 0.2, y: 4.85 } as const;
/** 세로 LED 바 패널 — 끝벽 바깥쪽 · 옆벽 기둥 옆. y0~y1 사이에 bars 개의 세로 바, 각 바를 segs 토막으로 */
export const LIGHT_COLUMN = { w: 1.1, y0: 1.4, y1: 7.4, bars: 3, segs: 4, gap: 0.18, barW: 0.035 } as const;
export const END_LIGHT_COLUMN_XS = [-13.2, 13.2] as const;

/** 벽 위·아래 가장자리 청색 LED 띠 높이 */
export const WALL_STRIP_YS = [0.14, ROOM.eave - 0.35] as const;
export const STRIP = { h: 0.025, d: 0.035 } as const;

/* ─────────────────────────────── 등 뒤 벽 — 격벽 링 · 격납문 ─────────────────────────────── */

/**
 * 들어오고 나가는 문 — 복도·창고·중앙 시설과 **같은 부품·같은 배율**(Tripo sci_bulkhead + sci_blast_door).
 * 심문소만 등 뒤가 맨 강판이라 「어디로 들어왔나」가 안 읽혔다. 열리지 않는다 — 등 뒤 벽 COLLIDER 가 막는다.
 * 이름이 RING 이 아닌 이유: 이 파일의 RING 은 무대 위 링 조명이다.
 */
export const BULKHEAD_SCALE = 6;
export const BULKHEAD = { scale: BULKHEAD_SCALE, sink: 0.12 * BULKHEAD_SCALE, thickness: 0.9 } as const;
export const DOOR = { w: 3.6, h: 3.7, depth: 0.35 } as const;
/** 격납문을 비추는 점광원 */
export const DOOR_LIGHT = { y: 3.6, intensity: 12, distance: 11 } as const;

/** 무장 심문 AI 가 달려 들어오는 자리 — 격납문 앞 (features/world/Enforcer.tsx). 복도·중앙 시설과 같은 약속 */
export const ENFORCER_SPAWN = { x: 0, z: ROOM.front - 1.5 } as const;

/* ─────────────────────────────── 선반 · 케이스 ─────────────────────────────── */

/**
 * 금속 랙 GLB(sci_rack, Tripo Studio) — 모델은 y 높이 1 · z 폭 0.76 · x 깊이 0.36. 폭이 x 로 오게 π/2 돌린다.
 * shelfTops 는 메시를 높이별로 잘라 잰 선반판 윗면 (모델 높이 기준 비율, 아래 → 위). 케이스와 LED 띠가 이 값에 붙는다.
 */
export const RACK = { w: 2.8, d: 1.0, h: 4.4, shelfTops: [0.08, 0.32, 0.56, 0.78] as const, topBeam: 0.98 } as const;
export interface RackPlace {
  x: number;
  z: number;
  /** y 회전. ±π/2 = 옆벽에 붙은 선반 */
  rot: number;
  /** 선반 밑 LED 앞에 실제 점광원을 켜나 */
  lit: boolean;
}
/** 옆벽 선반 — 홀수 bay(1·3·5) 가운데. 무대 쪽 bay 1 만 빼고 점광원 (4개) */
const SIDE_RACK_ZS = [1, 3, 5].map((i) => (COLUMN_ZS[i] + COLUMN_ZS[i + 1]) / 2);
const SIDE_RACK_X = HALF_W - RACK.d / 2 - 0.08;
export const RACKS: readonly RackPlace[] = SIDE_RACK_ZS.flatMap((z, i): RackPlace[] => [
  { x: -SIDE_RACK_X, z, rot: Math.PI / 2, lit: i >= 1 },
  { x: SIDE_RACK_X, z, rot: -Math.PI / 2, lit: i >= 1 },
]);

/** 금속 케이스 GLB(metal_case, Tripo Studio) — 모델은 x 폭 1 · y 높이 0.54 · z 깊이 0.7. 폭 w(m) 하나로 크기가 정해진다 */
export const CASE = { w: 1.0, h: 0.54, d: 0.7 } as const;
/** 선반 한 칸의 케이스 배치 (선반 로컬 x 중심, 폭 w). 칸마다 개수·크기가 조금씩 달라야 창고처럼 보인다 */
export const SHELF_CASES: readonly (readonly { x: number; w: number }[])[] = [
  [{ x: -0.9, w: 0.84 }, { x: 0, w: 0.88 }, { x: 0.9, w: 0.82 }],
  [{ x: -0.92, w: 0.86 }, { x: -0.02, w: 0.84 }, { x: 0.9, w: 0.86 }],
  [{ x: -0.55, w: 0.9 }, { x: 0.5, w: 0.86 }],
  [{ x: -0.9, w: 0.8 }, { x: 0.05, w: 0.82 }, { x: 0.92, w: 0.78 }],
];

/* ─────────────────────────────── 충돌 ─────────────────────────────── */

const WALL_T = 1;
const WALL_TOP = 6;

function rackCollider(r: RackPlace): Collider {
  const sideways = Math.abs(Math.sin(r.rot)) > 0.5;
  return {
    x: r.x,
    z: r.z,
    hw: (sideways ? RACK.d : RACK.w) / 2 + 0.04,
    hd: (sideways ? RACK.w : RACK.d) / 2 + 0.04,
    rot: 0,
    top: RACK.h,
  };
}

/**
 * ★ 스폰 원 위에는 아무것도 없다 — 빈 바닥뿐이다.
 * 무대턱은 STEP_UP 보다 낮아 걸어 올라간다.
 */
export const COLLIDERS: readonly Collider[] = [
  { x: -(HALF_W + WALL_T / 2), z: MID_Z, hw: WALL_T / 2, hd: DEPTH / 2 + 1, rot: 0, top: WALL_TOP },
  { x: HALF_W + WALL_T / 2, z: MID_Z, hw: WALL_T / 2, hd: DEPTH / 2 + 1, rot: 0, top: WALL_TOP },
  { x: 0, z: ROOM.back - WALL_T / 2, hw: HALF_W + 1, hd: WALL_T / 2, rot: 0, top: WALL_TOP },
  { x: 0, z: ROOM.front + WALL_T / 2, hw: HALF_W + 1, hd: WALL_T / 2, rot: 0, top: WALL_TOP },
  { x: 0, z: STAGE_Z, hw: STAGE.w / 2, hd: STAGE.d / 2, rot: 0, top: STAGE.h },
  ...RACKS.map(rackCollider),
];
