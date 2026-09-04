/**
 * SF 복도 맵 — **치수·배치의 단일 출처.** corridor.tsx(그리기)와 Lights(광원 위치)가 같은 숫자를 읽는다.
 * 튜브·콘솔·격자 같은 부품 규격은 격납고 홀과 공통이라 map/scifi.tsx 에 있다 — 여기는 이 복도의 치수와 자리뿐이다.
 *
 * mp/collide.ts 는 워커도 읽는 순수 파일이라 여기서 import 하지 못하고 값을 베껴 적는다 — **여기를 고치면 collide.ts 의 COLLIDERS 도 같이 고친다.**
 *
 * 참고 이미지(2026-08-29): 어두운 우주선 복도. 단면은 **8각** — 수직 벽 위가 45° 로 안쪽으로 꺾여 천장에 닿는다.
 * 굵은 격벽 리브가 일정 간격으로 서고, 리브 사이 패널에 청백색 발광 튜브가 박혀 있다. 끝에 8각 엠블럼의 격납문.
 *
 * 좌표계: 길이 방향 z (먼 끝벽 -22 · 가까운 끝벽 14), 벽 안쪽 면 x = ±5, 바닥 0, 천장 5.6. (2026-08-29 사용자 요청으로 8.4×28 → 10×36 으로 넓힘)
 * 서버가 검증하는 WORLD(mp/constants.ts, x ±14.4 · z -23.4~15.4)는 벽보다 넓다 — 벽은 collide.ts 가 막는다. **끝벽을 옮기면 WORLD 도 같이** (z 중심 -4 유지).
 * 스폰 원(중심 (0,-2.5) 반지름 3.4) 위에는 아무것도 놓지 않는다 — 그래서 bay -4·0 에는 콘솔이 없다.
 */

import { metrics, type Profile, type RibSpec } from '../scifi';

/* ─────────────────────────────── 복도 뼈대 (8각 단면) ─────────────────────────────── */

/** 벽 안쪽 면 x. 참고 이미지의 복도는 높이보다 조금 넓은 정도 */
export const WALL_X = 5;
export const FAR_Z = -22;
export const NEAR_Z = 14;
/** 수직 벽이 끝나고 45° 경사면이 시작하는 높이 */
export const WALL_TOP_Y = 3.4;
export const CEILING_Y = 5.6;

/** 8각 단면 — 45° 가 되도록 천장 반폭 = 벽 x − (천장 − 수직 벽 끝) */
export const PROFILE: Profile = { wallX: WALL_X, wallTopY: WALL_TOP_Y, ceilingY: CEILING_Y, ceilHalf: WALL_X - (CEILING_Y - WALL_TOP_Y), farZ: FAR_Z, nearZ: NEAR_Z };
export const M = metrics(PROFILE);

/** 부품과 부품 사이에 두는 최소 여유(m) — 붙여 놓으면 z-fighting, 벌리면 틈이 보인다 */
export const GAP = 0.02;

/* ─────────────────────────────── bay · 리브 ─────────────────────────────── */

/** bay 길이. 36m 를 9칸 */
export const BAY = 4;
export const BAY_CENTERS = [-20, -16, -12, -8, -4, 0, 4, 8, 12] as const;
/** bay 경계의 격벽 리브 — 8개 (양 끝벽은 리브 대신 격벽 링이 문을 두른다) */
export const RIB_ZS = [-18, -14, -10, -6, -2, 2, 6, 10] as const;
/** 리브 단면 — 참고 이미지의 리브는 굵고 깊다 */
export const RIB: RibSpec = { d: 0.4, t: 0.7, bevel: 0.03 };

/** 콘솔이 놓이는 bay — 스폰 원(-5.9~0.9) 옆 -4·0 은 비운다. 양쪽 7 × 2 = 14 */
export const CONSOLE_BAYS = [-20, -16, -12, -8, 4, 8, 12] as const;
/**
 * 챕터 1 의 "어떤 방" — 이 bay 는 벽 장식(세로 튜브·데이터 화면·패널 면)을 비워 맨 강판이 드러난다.
 * 양쪽 벽에 개체들이 그린 크레용 그림이 크게 걸린다 — 오른쪽은 사람이 개체를 때리는 그림(이야기 트리거), 왼쪽은 쉬는 인간과 일하는 개체
 * (features/world/Chapter1Scene.tsx 의 DRAWINGS · scrawl.ts). 2026-08-31 사용자: 의미 없는 글자 대신 그림으로
 */
export const INSCRIPTION_BAY = -8;
/**
 * 정비 단말이 붙는 bay — 스폰 바로 왼쪽. 여기도 벽 장식(세로 튜브·데이터 화면·패널 면)을 비운다.
 * 안 비우면 세로 발광 튜브가 단말 화면을 관통한다 (2026-08-30 확인). 콘솔도 원래 없는 bay 라(CONSOLE_BAYS) 맨 강판이 드러나
 * 「정비 구역」으로 읽힌다 — 챕터 1 의 식별번호를 여기서 읽는다 (features/world/Chapter1Scene.tsx)
 */
export const SERVICE_BAY = -4;
export const DECOR_BAYS = BAY_CENTERS.filter((z) => z !== INSCRIPTION_BAY && z !== SERVICE_BAY);

/* ─────────────────────────────── 끝벽 · 격납문 ─────────────────────────────── */

/**
 * 격벽 링(Tripo sci_bulkhead) — 모델은 높이 1 에 안쪽 개구 폭 0.624·높이 0.75, 안쪽 바닥 가장자리가 y 0.12. 위쪽만 45° 챔퍼.
 * 균등 배율 scale 로 세우고 안쪽 바닥이 복도 바닥에 오도록 sink 만큼 내린다 (받침판·아래 바는 바닥 밑).
 */
export const RING_SCALE = 6;
export const RING = { scale: RING_SCALE, sink: 0.12 * RING_SCALE, thickness: 0.9, innerHalfW: 0.312 * RING_SCALE } as const;
/** 격납문(Tripo sci_blast_door) — 링 개구 안에 꽉 차게. 열리지 않는다 — 벽은 collide.ts 가 막는다 */
export const DOOR = { w: 3.6, h: 3.7, depth: 0.35 } as const;

/* ─────────────────────────────── 조명 자리 ─────────────────────────────── */

/** bay 마다 차가운 점광원 하나 — 벽·리브에 형태를 준다. 천장에서 멀리 내려야 천장에 빛 반점이 안 생긴다 (2026-08-29 사용자 지적) */
export const BAY_LIGHT = { y: CEILING_Y - 2.4, intensity: 16, distance: 13 } as const;
/** 문 앞 점광원 — 격납문·링을 비춘다 */
export const DOOR_LIGHT = { y: 3.6, off: 2.6, intensity: 7, distance: 10 } as const;

/* ─────────────────────────────── 시선 초점 ─────────────────────────────── */

/** 먼 끝 격납문의 눈높이 조금 위. **들어오면 이 점을 보고 시작한다** (WorldScene 의 LocalRig) */
export const FOCUS = { x: 0, y: DOOR.h * 0.5, z: FAR_Z } as const;
