/**
 * 격납고 홀(창고 맵, /warehouse) — **치수·배치·충돌의 단일 출처.** warehouse.tsx(그리기)가 여기 숫자로 부품을 늘어놓는다.
 *
 * 2026-08-29 참고 이미지대로 재구성 (이전 널판 창고를 갈아엎었다): 복도와 같은 8각 강판 셸을 넓게 — 굵은 리브, 옆벽 튜브·콘솔.
 * 끝벽엔 8각 관찰창(유리 너머 관제실)과 양옆 모니터 2×2, 그 아래 앞이 깎인 8각 무대(앞 계단 3단, 앞면 발광 띠, 윗면 원형 표식),
 * 무대 위 천장에서 내려온 링 조명. 등 뒤 벽엔 격납문.
 *
 * 좌표계: 길이 방향 z (무대벽 -20 · 등 뒤 벽 12), 벽 안쪽 면 x = ±12, 바닥 0, 수직 벽 5, 천장 8.
 * 서버가 검증하는 WORLD(mp/constants.ts, x ±14.4 · z -23.4~15.4)보다 안쪽이다. 스폰 원(중심 (0,-2.5) 반지름 3.4) 위에는 아무것도 없다.
 *
 * three.js 를 끌어오지 않는 순수 파일이다 — 충돌 목록(COLLIDERS)이 mp/collide.ts 의 순수 함수로 그대로 들어간다.
 * (scifi.tsx 의 metrics 는 순수 계산이지만 그 모듈이 three 를 끌어오므로 여기서는 부르지 않는다 — warehouse.tsx 가 부른다.)
 */

import type { Collider } from '../../mp/collide';

/* ─────────────────────────────── 홀 뼈대 (8각 단면) ─────────────────────────────── */

export const WALL_X = 12;
export const FAR_Z = -20;
export const NEAR_Z = 12;
export const WALL_TOP_Y = 5;
export const CEILING_Y = 8;
/** 45° 경사 — 천장 반폭 = 벽 x − (천장 − 수직 벽 끝) */
export const CEIL_HALF = WALL_X - (CEILING_Y - WALL_TOP_Y);
export const PROFILE = { wallX: WALL_X, wallTopY: WALL_TOP_Y, ceilingY: CEILING_Y, ceilHalf: CEIL_HALF, farZ: FAR_Z, nearZ: NEAR_Z } as const;
export const MID_Z = (FAR_Z + NEAR_Z) / 2;

/** bay 길이 4 — 32m 를 8칸 */
export const BAY_CENTERS = [-18, -14, -10, -6, -2, 2, 6, 10] as const;
/** bay 경계의 격벽 리브 7개 — 홀이 크니 복도보다 굵고 깊다 */
export const RIB_ZS = [-16, -12, -8, -4, 0, 4, 8] as const;
export const RIB = { d: 0.6, t: 1.0, bevel: 0.04 } as const;
/** 옆벽 콘솔 — 모든 bay 양쪽 (스폰 원은 벽에서 8m 넘게 떨어져 있다) */
export const CONSOLE_BAYS = BAY_CENTERS;
/** 콘솔 규격은 scifi.tsx 의 CONSOLE 과 같은 값 — 충돌 계산용으로 베낀다 */
const CONSOLE_D = 0.7;
const CONSOLE_LEN = 2.4;
const CONSOLE_H = 0.85;

/* ─────────────────────────────── 무대 (끝벽 앞) ─────────────────────────────── */

/**
 * 8각 무대 — 폭 w, 깊이 d (뒷면이 끝벽), 높이 h. 앞쪽 두 모서리만 chamfer 만큼 깎는다 (뒤는 벽).
 * h 0.75 는 STEP_UP(0.55)보다 높아 옆에서 막히고, 앞 계단으로 걸어 오르거나 점프해 올라선다.
 */
export const STAGE = { w: 12, d: 6, h: 0.75, chamfer: 1.6 } as const;
export const STAGE_Z = FAR_Z + STAGE.d / 2;
export const STAGE_FRONT_Z = FAR_Z + STAGE.d;
/** 앞 계단 3단 — 무대 앞면에서 앞으로. 각 단 rise 높이·run 깊이·폭 w. 단 높이 0.25 ≤ STEP_UP 이라 걸어 오른다 */
export const STEPS = { n: 3, rise: 0.25, run: 0.42, w: 5.2 } as const;
/** 무대 앞면·계단 앞면의 발광 띠 높이(앞면 중간)와 단면 */
export const STAGE_STRIP = { y: 0.42, h: 0.06, d: 0.03 } as const;
/** 무대 윗면 원형 표식 — 링 조명 바로 아래 */
export const STAGE_MARK = { r: 1.7, ring: 0.08 } as const;

/** 링 조명(Tripo ring_lamp, 심문소 부품 재사용) — 무대 중앙 위. y 는 링 밑면 */
export const RING_LAMP = { y: 6.4, dia: 2.6 } as const;

/* ─────────────────────────────── 끝벽 — 관찰창 · 모니터 ─────────────────────────────── */

/**
 * 8각 관찰창 — 중심 높이 y, 안쪽 개구 w×h, 모서리 chamfer. 프레임은 두 단(바깥 두꺼운 테 + 안쪽 한 단 들어간 테)으로 폭 frame,
 * 벽에서 depth 돌출. step 은 안쪽 단의 폭. 유리는 프레임 깊숙이(벽 가까이) 매립된다 — 참고 이미지처럼 창이 "깊다"
 */
export const WINDOW = { y: 3.9, w: 9.6, h: 2.9, chamfer: 0.75, frame: 0.6, step: 0.22, depth: 0.5 } as const;
/** 모니터 2×2 × 양쪽 — 클러스터 중심 x, 높이 y, 화면 크기, 간격. 뒤에 세로 지지 기둥(post)과 위아래 브래킷 */
export const SCREENS = { cx: 8.7, y: 3.9, w: 1.5, h: 1.12, gapX: 0.3, gapY: 0.24, post: { w: 0.26, d: 0.22 } } as const;
/** 끝벽 강판 결 — 넓은 벽이라 옆벽(3.2m)보다 큰 타일. 잘면 산만하다 (2026-08-29 사용자 지적) */
export const END_WALL_TILE = 6.4;
/** 링 조명 아래 은은한 빛기둥 — 참고 이미지의 부드러운 광선. 가산 혼합의 아주 옅은 원뿔 */
export const BEAM = { opacity: 0.035, topR: 0.9, bottomR: 2.6 } as const;

/** 등 뒤 벽 격납문 + 격벽 링 (복도와 같은 부품·배율) */
export const RING_SCALE = 6;
export const RING = { scale: RING_SCALE, sink: 0.12 * RING_SCALE, thickness: 0.9 } as const;
export const DOOR = { w: 3.6, h: 3.7, depth: 0.35 } as const;

/* ─────────────────────────────── 화물 컨테이너 ─────────────────────────────── */

/**
 * 홀 바닥의 화물 컨테이너 — **새 모델은 없다.** 심문소 부품 `metal_case` GLB 를 컨테이너 크기로 키워 쌓은 것이다
 * (전용 모델 `cargo_container` 가 나오면 warehouse.tsx 의 Parts id 한 줄만 바꾼다).
 *
 * 왜 바닥에 물건을 놓나: lab/objects.ts 의 카탈로그가 곧 **리더가 시행을 설계할 때 쓰는 어휘**인데
 * (lab/free.ts 가 objectTable() 을 프롬프트에 그대로 넣는다), 무대 하나와 옆벽 콘솔 16개가 전부라
 * **판이 벌어지는 홀 한가운데를 가리킬 말이 없었다.** 1단은 올라설 수 있고(objects.ts 의 MOUNT_LIMIT),
 * 2·3단은 못 올라간다 — 리더가 「컨테이너1 위에 올라서라」와 「컨테이너3 뒤에 서라」를 둘 다 쓸 수 있다.
 *
 * ★ 1단 높이는 **점프로 닿는 높이**여야 한다. 사람은 3D 로 뛰어오르고(mp/constants 의 최고점 ≈1.05m)
 *   개체는 2D 평면 위를 걸어 그냥 올라선다 — 여기가 어긋나면 사람만 못 오르는 지시가 나온다.
 *   0.9 는 무대턱(0.75)보다 높고 최고점보다 낮다. **여기를 올리려면 그 수부터 본다.**
 *
 * ★ 배회 마당(features/arena/lineup 의 ROAM = x ±7 · z −12~0.5) **안에는 놓지 않는다.** 두 가지가 걸린다:
 *   ① 시선을 끊으면 말하는 몸이 안 보인다 (2026-09-01 사용자 결정 — 「대화 로그만 흐르고 말하는 몸이 안 보인다」).
 *   ② **시행 판정이 흔들린다.** 마당 가장자리(±6.9, −9.4)에 놓아 봤더니 왕복판 오탐이 100번에 6번까지
 *      올랐다 (tests/features/arena/separate.test.ts 가 잡았다 — 문턱은 3). 판이 까는 원과 그 사이 경로가
 *      물건을 도느라, **제 계획대로 걸은 몸이 늦은 몸으로 기록된다.** 자리 때문에 걸리면 안 된다는 것이
 *      이 판의 불변 규칙이다 (I1~I8). 그래서 여기 여섯은 전부 마당 밖 — 옆벽 쪽·무대 옆·등 뒤 절반이다.
 *      **자리를 옮길 때는 그 시험을 다시 돌린다.**
 * ★ 스폰 원(중심 (0,−2.5) 반지름 3.4) 위에는 아무것도 없다. */
/**
 * 한 칸 크기. 높이 0.9 는 **점프로 닿는 높이**라 못 바꾼다 (위 ★). 폭·깊이는 모델 비율(1 : 0.79 : 0.83)에
 * 되도록 가깝게 — 너무 납작하게 늘이면 골함석 골이 옆으로 늘어져 컨테이너로 안 읽힌다.
 */
export const CARGO = { w: 1.9, h: 0.9, d: 1.35 } as const;
export interface CargoPlace {
  x: number;
  z: number;
  /** 몇 단으로 쌓았나. 1 단만 올라설 수 있다 */
  stack: 1 | 2 | 3;
  /** 폭(w)이 놓이는 축. 'z' 면 90° 돌아 앉는다 — 충돌은 어느 쪽이든 축에 나란하다 (lab/arena 의 Obstacle 은 회전이 없다) */
  dir: 'x' | 'z';
}
export const CARGOS: readonly CargoPlace[] = [
  // 옆벽 쪽 — 마당 밖이면서 마당에서 보이는 자리. 시행이 「올라서라」를 쓰는 둘
  { x: -9.2, z: -9.4, stack: 1, dir: 'z' },
  { x: 9.2, z: -9.4, stack: 1, dir: 'z' },
  // 무대 옆 죽은 자리 — 무대를 액자에 넣는다 (무대는 x ±6 이라 안 가린다)
  { x: -8.9, z: -15.2, stack: 3, dir: 'z' },
  { x: 8.9, z: -15.2, stack: 3, dir: 'z' },
  // 등 뒤 절반 — 돌아서면 격납문 말고는 아무것도 없던 곳
  { x: -7.4, z: 5.0, stack: 1, dir: 'z' },
  { x: 7.4, z: 5.0, stack: 2, dir: 'z' },
];

/** 컨테이너 하나의 발자국 (x 반폭, z 반깊이) — dir 이 'z' 면 폭과 깊이가 바뀐다 */
export function cargoFootprint(c: CargoPlace): { hw: number; hd: number } {
  return c.dir === 'x' ? { hw: CARGO.w / 2, hd: CARGO.d / 2 } : { hw: CARGO.d / 2, hd: CARGO.w / 2 };
}

/* ─────────────────────────────── 천장 갠트리 크레인 ─────────────────────────────── */

/**
 * 홀을 가로지르는 갠트리 크레인 — **죽어 있던 천장(y 5~8)을 채운다.** 여기는 격납고인데
 * 천장에 매달린 것이 무대 위 링 조명 하나뿐이라, 올려다보면 아무 일도 없는 빈 강판이었다.
 *
 * 레일 두 줄(옆벽 위)·가로 거더 하나·양 끝 대차는 상자로 그리고, 거더에 매달린 호이스트만 GLB(crane_hoist)다.
 * 8각 단면이라 **높이마다 반폭이 다르다** — y 에서의 반폭은 wallX − (y − wallTopY) 다 (metrics 의 경사면).
 * 레일 y 5.2 → 11.8 · 거더 위끝 y 5.98 → 11.02. 그래서 거더는 ±10.9 까지만 뻗는다.
 *
 * 사람 머리 위 3.8m 라 **충돌은 없다.** 움직이지도 않는다 — 정지한 기계 한 대가 홀의 크기를 말해 준다.
 */
export const CRANE = {
  /** 레일 — 옆벽 위를 길이 방향으로 지른다 */
  railY: 5.15,
  railX: 11.3,
  railW: 0.35,
  /** 가로 거더 — 이 z 에 서 있다. 무대(−17)에서 멀리, 홀 한가운데 조금 앞 */
  z: -3,
  girderY: 5.7,
  girderHalfW: 10.9,
  girderH: 0.7,
  girderD: 0.5,
  /** 거더 양 끝 대차 */
  truckW: 1.1,
  truckH: 0.7,
  /**
   * 호이스트 — 거더 밑에 매달린다. x 는 거더 위 자리, y 는 발밑.
   * **모델에 케이블이 이미 달려 있다** (위가 대차, 아래가 권상기) — 따로 줄을 긋지 않는다.
   * 윗면(hoistY + hoistH)이 거더 아랫면(girderY − girderH/2)에 딱 닿게 잡은 값이다.
   */
  hoistX: 4,
  hoistY: 3.75,
  hoistH: 1.6,
} as const;

/* ─────────────────────────────── 등 뒤 벽 충전 도크 ─────────────────────────────── */

/**
 * 격납문 양옆의 충전 도크 — 개체가 서서 충전하는 자리. **돌아서면 문 말고는 아무것도 없던 벽이다.**
 * 이야기로도 맞는 것이: 여기 개체들은 이 홀의 재고다.
 *
 * 격벽 링(RING_SCALE 6 → 폭 5.36, x ±2.68)을 비켜 바깥쪽에 둘씩. 벽에서 depth 만큼 튀어나오므로
 * **충돌 상자를 준다** — 안 그러면 사람이 도크 속으로 걸어 들어간다.
 * ★ 다만 lab/objects.ts 의 카탈로그에는 **안 들어간다** (COLLIDERS 를 컨테이너까지만 잘라 읽는다):
 *   ARENA 는 z 11.4 까지라 도크 앞은 이미 방 밖이고, 리더에게 「도크1 앞에 서라」를 주면
 *   아무도 갈 수 없는 지시가 된다.
 */
/** 모델이 가늘고 길다 (0.305 : 1 : 0.311) — 폭을 너무 벌리면 늘어난 티가 난다 */
export const DOCK = { w: 1.0, h: 2.6, depth: 0.7 } as const;
export const DOCK_XS = [-6.4, -4.2, 4.2, 6.4] as const;

/* ─────────────────────────────── 감시 드론 ─────────────────────────────── */

/**
 * 홀을 도는 감시 드론 하나 — **이 방에서 유일하게 움직이는 배경이다.**
 * 여태 격납고 홀은 통째로 정지해 있어서, 개체들이 말을 멈추면 화면이 사진이 됐다.
 * 방이 나를 보고 있다는 것도 그림으로 한 번은 말해야 한다 (의심도·검문이 이 세계의 전부다).
 *
 * 광원은 안 준다 — 이 맵의 실제 광원 12개는 정해진 예산이다. 렌즈는 발광 재질로만 빛난다.
 * 크레인 거더(위끝 5.98)보다 높이 돈다.
 */
export const DRONE = { y: 6.6, r: 8, cz: -4, period: 44, bob: 0.25, size: 0.9 } as const;

/* ─────────────────────────────── 옆벽에서 움직이는 것 둘 ─────────────────────────────── */

/**
 * ── 배기 팬 · 검사 암 ── (2026-09-02 사용자: "맵 꾸밀만한 거 있을까? 역동적이고 여기에 잘 어울리는 glb")
 *
 * 이 홀에서 움직이는 것은 드론 하나뿐이었다. 크레인은 주석에 적힌 대로 **정지한 기계**고,
 * 그러면 개체들이 말을 멈춘 순간 화면이 사진이 된다. 움직이는 것을 늘리되 **바닥은 못 쓴다** —
 * 배회 마당(x ±7 · z −12~0.5)에 물건을 놓으면 시선을 끊고 시행 판정이 흔들린다 (CARGOS 의 ★).
 * 그래서 둘 다 **옆벽 위쪽**이다: 콘솔(높이 0.85) 위, 수직 벽이 끝나는 y 5 아래.
 *
 * 사람 머리 위 2m 가 넘어 **충돌도 없고 lab/objects.ts 카탈로그에도 안 들어간다** — 리더가
 * 「배기 팬 앞에 서라」를 쓰면 아무도 갈 수 없는 지시가 된다 (도크와 같은 이유).
 */

/**
 * 도는 배기 팬 — 날개만 뽑은 모델이라 통째로 돌린다. 테는 원이라 돌아도 티가 안 나서,
 * 그 자체가 정지한 보호망으로 읽힌다 (모델 하나로 도는 것과 안 도는 것을 같이 얻는다).
 *
 * bay 두 곳(−14 · 6)에 양 벽 — 넷이다. 하나는 무대 쪽, 하나는 등 뒤 쪽이라 **어느 쪽을 봐도
 * 하나는 시야에 든다.** 주기는 눈이 날개를 셀 수 없을 만큼 빠르되(2.6초/바퀴) 어지럽지는 않게.
 */
export const FAN = { dia: 1.8, y: 3.5, gap: 0.2, zs: [-14, 6], period: 2.6 } as const;

/**
 * 훑는 검사 암 — 벽판을 축으로 시계바늘처럼 좌우로 쓸어 본다. 모델은 마디가 하나로 붙어 있어
 * 관절이 안 접히는데, **벽판이 원이라** 그 축으로 돌리면 관절 없이도 「훑는다」가 된다.
 *
 * 팬과 다른 bay(−6 · 2)에 걸어 벽이 한 자리에서만 움직이지 않게 한다. 넷이 같은 박자로 흔들리면
 * 기계가 아니라 장식이라, 자리마다 위상을 어긋나게 준다 (warehouse.tsx 의 phase).
 */
export const ARM = { len: 1.9, y: 3.15, zs: [-6, 2], sweep: 0.55, period: 15 } as const;

/* ─────────────────────────────── 조명 자리 ─────────────────────────────── */

/** bay 마다 차가운 점광원 — 천장에서 멀리 (천장 반점 방지). 홀이 넓어 복도보다 세다 */
export const BAY_LIGHT = { y: CEILING_Y - 3.2, intensity: 30, distance: 18 } as const;
/** 링 조명 → 무대 (스포트, 그림자 없음) */
export const STAGE_SPOT = { intensity: 90, angle: 0.55, distance: 14 } as const;
/** 관찰창·모니터를 비추는 점광원 */
export const END_LIGHT = { y: 4.2, off: 3.0, intensity: 16, distance: 12 } as const;

/* ─────────────────────────────── 시선 초점 ─────────────────────────────── */

/** 무대 한가운데 조금 위. **들어오면 이 점을 보고 시작한다** */
export const FOCUS = { x: 0, y: 2.2, z: STAGE_Z } as const;

/* ─────────────────────────────── 충돌 ─────────────────────────────── */

const WALL_T = 1;
const WALL_TOP = 6;

/**
 * ★ 스폰 원 위에는 아무것도 없다 — 빈 바닥뿐이다. 순서: 벽 4 → 무대 1 → 계단 3 → 리브 14 → 콘솔 16 → 컨테이너 6 → 등 뒤 도크 4.
 * 리브 다리·콘솔은 옆벽에 붙어 있다. 무대는 8각이지만 충돌은 직사각형 — 깎인 모서리는 벽 옆이라 티가 안 난다.
 */
export const COLLIDERS: readonly Collider[] = [
  { x: -(WALL_X + WALL_T / 2), z: MID_Z, hw: WALL_T / 2, hd: (NEAR_Z - FAR_Z) / 2 + 1, rot: 0, top: WALL_TOP },
  { x: WALL_X + WALL_T / 2, z: MID_Z, hw: WALL_T / 2, hd: (NEAR_Z - FAR_Z) / 2 + 1, rot: 0, top: WALL_TOP },
  { x: 0, z: FAR_Z - WALL_T / 2, hw: WALL_X + 1, hd: WALL_T / 2, rot: 0, top: WALL_TOP },
  { x: 0, z: NEAR_Z + WALL_T / 2, hw: WALL_X + 1, hd: WALL_T / 2, rot: 0, top: WALL_TOP },
  { x: 0, z: STAGE_Z, hw: STAGE.w / 2, hd: STAGE.d / 2, rot: 0, top: STAGE.h },
  // 계단 — 낮은 단이 앞. i 번째 단의 윗면 = rise × (n − i)
  ...Array.from({ length: STEPS.n }, (_, i) => ({
    x: 0,
    z: STAGE_FRONT_Z + STEPS.run * (i + 0.5),
    hw: STEPS.w / 2,
    hd: STEPS.run / 2,
    rot: 0,
    top: STEPS.rise * (STEPS.n - i),
  })),
  ...RIB_ZS.flatMap((z) => [
    { x: -(WALL_X - RIB.d / 2), z, hw: RIB.d / 2, hd: RIB.t / 2, rot: 0, top: WALL_TOP },
    { x: WALL_X - RIB.d / 2, z, hw: RIB.d / 2, hd: RIB.t / 2, rot: 0, top: WALL_TOP },
  ]),
  ...CONSOLE_BAYS.flatMap((z) => [
    { x: -(WALL_X - CONSOLE_D / 2), z, hw: CONSOLE_D / 2, hd: CONSOLE_LEN / 2, rot: 0, top: CONSOLE_H },
    { x: WALL_X - CONSOLE_D / 2, z, hw: CONSOLE_D / 2, hd: CONSOLE_LEN / 2, rot: 0, top: CONSOLE_H },
  ]),
  // ★ 컨테이너는 **맨 뒤**다. lab/objects.ts 가 이 목록을 순서(인덱스)로 잘라 읽으므로 중간에 끼우면 카탈로그가 통째로 밀린다
  ...CARGOS.map((c) => {
    const { hw, hd } = cargoFootprint(c);
    return { x: c.x, z: c.z, hw: hw + 0.05, hd: hd + 0.05, rot: 0, top: CARGO.h * c.stack };
  }),
  // 등 뒤 벽 충전 도크 — **카탈로그에는 안 들어간다** (objects.ts 가 컨테이너까지만 잘라 읽는다). 여기는 몸을 막기만 하는 붙박이다
  ...DOCK_XS.map((x) => ({ x, z: NEAR_Z - DOCK.depth / 2, hw: DOCK.w / 2, hd: DOCK.depth / 2, rot: 0, top: DOCK.h })),
];
