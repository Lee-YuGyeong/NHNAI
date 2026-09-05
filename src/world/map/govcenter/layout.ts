/**
 * 특수인공지능대응센터 홀 (/interrogation 의 배경) — **치수·배치의 단일 출처.** govcenter.tsx(그리기)가 여기 숫자로 부품을 늘어놓는다.
 *
 * 참고 이미지(2026-09-04): 콘크리트 대형 홀. 끝벽에 3면 대형 상황판(한반도 지도·데이터·안면 스캔), 그 위에 정부 상징과
 * 「대한민국 정부 특수인공지능대응센터」 간판. 양 옆벽엔 2층 메자닌 유리 관제실(중앙 통제실·연구구역)과 1층 유리실(서버실·AI 분석실),
 * 형광등 천장, 광택 콘크리트 바닥에 노란 차선. 앞쪽 끝벽·옆벽에 철문과 호박색 벽등.
 *
 * ★ **발자국·충돌은 격납고 홀(warehouse/layout.ts) 그대로다 — 무대와 계단만 뺀다.** 게임(features/arena)의 바닥 치수(ARENA)·
 *   오브젝트 카탈로그(lab/objects.ts)·시행 판정이 전부 그 파일의 COLLIDERS 를 순서대로 읽는다 — 여기서 콘솔·컨테이너를 옮기면
 *   게임이 같이 움직인다. 그래서 이 파일은 **보이는 것**만 정한다. 벽 x ±12 · z −20~12 · 리브 · 콘솔 16 · 컨테이너 6 · 도크 4 는
 *   재수출한다. 방(알코브)은 전부 벽면 **바깥**(|x| > 12)에 파고, 메자닌은 머리 위(y ≥ 4.5)라 충돌 상자가 필요 없다.
 * ★ **단상(무대턱 0.75m · 계단 셋)은 없다** (2026-09-05 사용자: "단상 없애줘"). 끝벽 앞은 평평한 바닥이고 처형자는 거기 선다.
 * ★ **등 뒤 벽의 격납문·격벽 링·충전 도크 넷도 없다** (2026-09-05 사용자: "이 앞의 문과 거치대가 좀 이상한데"). 격납고 부품을
 *   노멀맵만 남기고 가져온 것이라 이 홀의 빛에서는 도크가 구겨진 철판으로, 격납문은 링 안에 안 맞는 문짝으로 읽혔다. 그 자리에는
 *   이 홀의 **철문 두 짝**(STEEL_DOOR, BACK_DOOR_XS)과 벽등이 선다 — 끝벽·옆벽의 문과 같은 얼굴이다.
 *   충돌 목록은 무대·계단·도크를 뺀 HALL_COLLIDERS 다 — 격납고의 COLLIDERS 는 순서로 읽히는 카탈로그라 거기서 빼면 안 되고, 여기서 거른다.
 * ★ **더하는 것도 여기서 한다** — 끝벽 앞에 선 처형자의 몸 상자 하나(EXECUTIONER). 같은 이유로 격납고 목록에는 안 넣는다.
 *
 * three.js 를 끌어오지 않는 순수 파일이다.
 */

export {
  BAY_CENTERS,
  CARGO,
  CARGOS,
  COLLIDERS,
  CONSOLE_BAYS,
  DRONE,
  FAR_Z,
  FOCUS,
  MID_Z,
  NEAR_Z,
  RIB,
  RIB_ZS,
  STAGE_Z,
  WALL_X,
  cargoFootprint,
  type CargoPlace,
} from '../warehouse/layout';

import { COLLIDERS, DOCK, DOCK_XS, FAR_Z, NEAR_Z, RIB_ZS, STAGE, STAGE_Z, STEPS, WALL_X } from '../warehouse/layout';

/**
 * 처형자의 몸 — 홀에서 **이 몸만 뚫렸다** (2026-09-06 사용자: "리더 그거 몸이 뚫리는데").
 * 그 자리를 막던 상자는 무대 하나뿐이었는데 단상을 걷으며 같이 빠졌고(아래 filter), 처형자는 씬에 그려지는 물체라
 * 몸끼리 밀어내는 목록(net/remote-players 의 pushOut)에도 없다 — 벽도 가구도 남의 어깨도 다 막는 방에서 혼자 통과됐다.
 *
 * 자는 **남의 몸과 같게** 잡는다(CHAR_BODY_R 0.35): 그에게 부딪히는 거리가 사람에게 부딪히는 거리와 같아진다.
 * 정사각이라 모서리 쪽만 조금 멀리서 막히는데, 몸이 표적을 따라 도니까 어느 쪽으로 서도 같은 폭인 편이 낫다.
 * top 은 그의 키(scene/Executioner 의 HEIGHT 1.9) — 낮은 턱(STEP_UP 0.55)이 아니라 벽처럼 막고, 점프 최고점(≈1.05)으로는
 * 머리 위에 못 올라선다.
 *
 * 복도의 경비·요원은 명부(mp/bystanders)로 같은 일을 하는데(2026-09-05 fix(world)), 이 몸은 **한자리에 붙박이라** 맵의 상자가
 * 맞다: 프레임마다 자리를 알릴 것이 없고, 홀의 다리 전부(FreeRig · DiscRig · …)가 이미 이 목록을 본다. 그가 걷기 시작하면
 * 그때 명부로 옮긴다.
 */
const EXECUTIONER: (typeof COLLIDERS)[number] = { x: 0, z: STAGE_Z, hw: 0.35, hd: 0.35, rot: 0, top: 1.9 };

/**
 * 이 홀의 충돌 상자 — 격납고의 COLLIDERS 에서 **무대 1 + 계단 STEPS.n + 도크 DOCK_XS.length** 를 빼고 **처형자 1** 을 더한 것
 * (머리말 ★). 자리로 안 자르고 모양으로 거른다: 무대는 x 0 · z STAGE_Z · 윗면 STAGE.h, 계단은 x 0 의 낮은 단(윗면 ≤ rise × n ·
 * 폭 STEPS.w), 도크는 등 뒤 벽(z NEAR_Z 쪽)에 붙은 DOCK.h 높이의 상자다. 격납고가 상자를 더 넣어도 여기서는 그 셋만 빠진다.
 */
export const HALL_COLLIDERS: readonly (typeof COLLIDERS)[number][] = [
  ...COLLIDERS.filter((c) => {
    const stage = c.x === 0 && c.z === STAGE_Z && c.top === STAGE.h;
    const step = c.x === 0 && c.top <= STEPS.rise * STEPS.n + 1e-6 && Math.abs(c.hw - STEPS.w / 2) < 1e-6;
    const dock = c.top === DOCK.h && c.z > NEAR_Z - DOCK.depth - 1e-6 && (DOCK_XS as readonly number[]).includes(c.x);
    return !stage && !step && !dock;
  }),
  EXECUTIONER,
];

/* ─────────────────────────────── 홀 뼈대 (직사각 콘크리트 박스) ─────────────────────────────── */

/** 천장 높이 — 참고 이미지는 층고가 높다. 메자닌(4.5)이 그 절반 아래 */
export const CEILING_Y = 11;
export const HALL_LEN = NEAR_Z - FAR_Z;
/** 콘크리트 결 타일 한 변(m) — 벽·바닥 */
export const WALL_TILE = 4;
export const FLOOR_TILE = 5;

/** 옆벽 기둥(필라스터) — 리브 충돌 상자(RIB_ZS · RIB.d 0.6 · RIB.t 1.0)와 같은 발자국. 바닥에서 천장까지 */
export const PILASTER = { d: 0.6, w: 1.0 } as const;
/** 끝벽·등 뒤 벽 모서리 기둥 — 옆벽 기둥과 같은 단면, 벽 안에 반쯤 묻힌다 */
export const CORNER_PILASTER_X = WALL_X - PILASTER.d / 2;

/** 천장 보 — 옆벽 기둥 z 마다 홀을 가로지르는 콘크리트 보 */
export const CEIL_BEAM = { h: 0.7, d: 0.5 } as const;
/** 형광등 줄 — 길이 방향 4줄, 3.2m 토막이 0.8m 띄워 이어진다. 천장 보 밑면(CEILING_Y − CEIL_BEAM.h)보다 아래 매달린다 */
export const FLUOR = { xs: [-8.4, -2.8, 2.8, 8.4], y: CEILING_Y - CEIL_BEAM.h - 0.18, len: 3.2, gap: 0.8, w: 0.22, h: 0.1 } as const;

/* ─────────────────────────────── 바닥 차선 ─────────────────────────────── */

/** 노란 차선 두 줄 — 참고 이미지의 바닥선. 두께 0.5cm 판이라 걸리지 않는다 */
export const LANE = { xs: [-7.6, 7.6], w: 0.14, color: '#b08a2a' } as const;

/* ─────────────────────────────── 메자닌 · 방(알코브) ─────────────────────────────── */

/** 2층 바닥판 높이·두께. 사람 머리 위(점프 최고점 ≈1.05 + 눈 1.6)라 충돌 없음 */
export const MEZZ = { y: 4.5, slabH: 0.35, walkD: 1.1 } as const;
/** 2층 난간 — 벽면(x ±12)에서 통로 앞쪽. 세로 살 간격·높이 */
export const RAIL = { h: 1.05, postGap: 1.6, bar: 0.05 } as const;

/**
 * 방 하나 = 벽면 바깥으로 depth 만큼 판 상자. z0~z1 이 벽을 따라 뚫린 폭, y0~y1 이 높이.
 * 앞면은 유리(벽면과 같은 x), 뒷벽에 인테리어 텍스처 한 장. 참고 이미지처럼 상단 간판이 붙는다.
 */
export interface RoomSpec {
  /** 간판 글씨 */
  label: string;
  /** 어느 벽 (−1 왼쪽, 1 오른쪽) */
  side: -1 | 1;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  depth: number;
  /** 뒷벽 인테리어 텍스처 키 (govcenter.tsx 의 TEX) */
  interior: 'control' | 'research' | 'server' | 'analysis';
  /** 안에 세울 GLB 소품 */
  props: 'racks' | 'desks' | 'none';
}

/** 2층 방은 통로 뒤에 앉는다 — 유리면이 벽에서 walkD 뒤 */
const UPPER_Y0 = MEZZ.y + MEZZ.slabH;
const UPPER_Y1 = CEILING_Y - 0.6;
export const ROOMS: readonly RoomSpec[] = [
  // 2층 — 무대 쪽 (참고 이미지의 왼쪽 위 중앙 통제실 · 오른쪽 위 연구구역)
  // 간판 표기는 사용자 지정 (2026-09-04): 왼쪽 중앙통제실 · 서버실, 오른쪽 연구구역 · AI분석실 — 띄어쓰기 없이
  { label: '중앙통제실', side: -1, z0: -19.4, z1: -8.6, y0: UPPER_Y0, y1: UPPER_Y1, depth: 4.5, interior: 'control', props: 'desks' },
  { label: '연구구역', side: 1, z0: -19.4, z1: -8.6, y0: UPPER_Y0, y1: UPPER_Y1, depth: 4.5, interior: 'research', props: 'desks' },
  // 1층 — 등 뒤 쪽 (왼쪽 서버실 · 오른쪽 AI분석실). 앞의 콘솔(충돌)은 유리 앞 카운터가 된다
  { label: '서버실', side: -1, z0: 0.6, z1: 11.4, y0: 0, y1: MEZZ.y - 0.05, depth: 4.5, interior: 'server', props: 'racks' },
  { label: 'AI분석실', side: 1, z0: 0.6, z1: 11.4, y0: 0, y1: MEZZ.y - 0.05, depth: 4.5, interior: 'analysis', props: 'desks' },
];
/** 간판 — 방 위쪽 유리 위 검정 띠에 흰 글씨 */
export const SIGN = { h: 0.7, textH: 0.44 } as const;

/**
 * 1층 방 안의 서버 랙 — 뒷벽 앞 한 줄. 모델(0.479 × 1 × 0.363)은 **망 문이 +x 면**이라 폭이 z, 깊이가 x 다 (tools/glb-preview 로 재었다).
 * 높이 2.2 로 맞추면 폭 0.8 · 깊이 1.05
 */
export const RACK = { w: 0.8, h: 2.2, d: 1.05, gap: 0.15 } as const;
/** 방 안의 워크스테이션(책상+모니터+의자) — 한 줄. 모델(0.896 × 1 × 0.969)은 모니터 앞이 +z. 높이 1.3 이면 폭 1.16 */
export const DESK = { w: 1.2, h: 1.3, d: 1.3, gap: 0.5 } as const;

/* ─────────────────────────────── 끝벽 — 대형 상황판 · 간판 ─────────────────────────────── */

/**
 * 3면 상황판 — 가운데 한반도 지도(16:9), 양옆 데이터·안면 스캔(4:3). 아랫변 y, 높이 h 로 세 장의 폭이 정해진다.
 * 무대(z −20~−14) 뒤 끝벽에 붙는다. 베젤은 검정 상자, 화면은 베젤 앞면보다 1cm 앞.
 */
export const BOARD = { y: 4.0, h: 4.2, gap: 0.16, bezel: 0.12, depth: 0.18 } as const;
export const BOARD_CENTER_W = BOARD.h * (16 / 9);
export const BOARD_SIDE_W = BOARD.h * (4 / 3);
/** 상황판 위 간판 — 정부 상징(원) + 글씨 한 줄. 캔버스 텍스처 */
export const TITLE = { y: 9.55, h: 0.9, w: 11.5, text: '대한민국 정부 특수인공지능대응센터' } as const;
export const EMBLEM = { y: 10.35, r: 0.42 } as const;

/** 1층 벽걸이 모니터 — 방이 없는 가운데 bay(−6 · −2)의 옆벽, 콘솔 위 */
export const WALL_MONITOR = { zs: [-6, -2], y: 2.3, w: 2.4, h: 1.35, bezel: 0.08, depth: 0.1 } as const;

/* ─────────────────────────────── 철문 · 벽등 ─────────────────────────────── */

/**
 * 철문 — 끝벽 양 끝(무대 옆)과 옆벽 bay 2. 모델(0.276 × 1 × 0.592)은 **창·키패드 면이 +x**, 폭이 z 다.
 * depth 로 두께를 눌러 놓고 절반을 벽에 묻는다
 */
export const STEEL_DOOR = { w: 1.3, h: 2.4, depth: 0.3 } as const;
export const END_DOOR_XS = [-10.4, 10.4] as const;
/** 등 뒤 벽 문 — 철문 두 짝이 나란히 서서 2.6m 두 짝 문이 된다 (격납문·도크가 있던 자리, 머리말 ★) */
export const BACK_DOOR_XS = [-STEEL_DOOR.w / 2, STEEL_DOOR.w / 2] as const;
/** 옆벽 문 — 이 bay 의 옆벽에 하나씩 (양쪽) */
export const SIDE_DOOR_Z = 2;
/** 호박색 벽등 — 문 옆 y 2.9. 모델은 바닥에 판이 붙은 채로 서 있어(+y 가 렌즈 쪽) 판이 벽을 보게 눕힌다. 실제 점광원은 끝벽 둘만 (조명 예산) */
export const WALL_LAMP = { y: 2.9, size: 0.34, off: 1.1 } as const;

/* ─────────────────────────────── 조명 자리 ─────────────────────────────── */

/**
 * 형광등 점광원 — 천장에서 조금 아래, 차갑고 넓게. **bay 여덟에 하나씩이 아니라 둘에 하나씩** 넷이다 (2026-09-05 최적화):
 * 광원은 세기·거리와 무관하게 개수만큼 모든 픽셀의 셰이더 루프를 늘리고, 이 홀은 큰 콘크리트 면이 화면을 채우는 씬이라
 * 광원 수가 곧 GPU 시간이었다. 거리 20 짜리 여덟이 4m 간격으로 겹쳐 있었으니 넷을 8m 간격 · 거리 24 · 세기 두 배로 놓으면
 * 바닥의 밝기 분포는 거의 같다. 형광등 **기구**(FLUOR)는 bay 마다 그대로 — 빛나 보이는 것은 발광 재질이지 광원이 아니다.
 */
export const BAY_LIGHT = { y: CEILING_Y - 2.2, intensity: 46, distance: 24 } as const;
export const BAY_LIGHT_ZS = [-16, -8, 0, 8] as const;
/** 상황판 → 무대·홀 앞쪽으로 번지는 푸른 빛 — 셋(좌·중·우)이 하나로. 세 판이 한 벽에 붙어 있어 한 광원으로 같은 색이 번진다 */
export const BOARD_LIGHT = { y: 6, off: 3.5, intensity: 44, distance: 20 } as const;
/** 끝벽 앞 스포트 (천장 기구에서 처형자가 서는 자리) — 단상은 없어졌지만 빛은 그 자리에 그대로 떨어진다 */
export const STAGE_SPOT = { y: CEILING_Y - 0.4, intensity: 110, angle: 0.5, distance: 16 } as const;
/** 끝벽 철문 벽등의 점광원 */
export const DOOR_LIGHT = { intensity: 6, distance: 7 } as const;

/** 리브 z 는 격납고 홀과 같다 — 옆벽 기둥이 곧 리브 충돌 상자다 */
export const PILASTER_ZS = RIB_ZS;
/** 끝벽 앞, 처형자가 서는 자리의 z — 스포트·초점. 옛 무대의 가운데다 */
export const STAGE_CENTER_Z = STAGE_Z;
