/**
 * 물리 미니게임 — 움직이는 플랫폼 (GAME 4, 2026-09-05 사용자 스펙).
 *
 *   발판들이 서로 다른 속도로 좌우로 움직이고, 참가자는 점프해서 다음 발판으로 건넌다. 여기서 보는 것은 **점프 정확도**다:
 *   사람은 너무 일찍 뛰고, 착지하면 휘청거리고, 한 번씩 거리 계산에 실패한다. AI 는 발판의 속도와 거리를 계산해 늘 거의 중앙에 내린다.
 *   판별 정보 — 착지 성공률 · 발판 중앙 착지율 · 점프 실패 횟수 · 착지 후 균형 회복. 열 번 뛰어 열 번 정중앙이면 그게 곧 표식이다.
 *
 * 이 파일은 **클라이언트와 워커가 같이 보는 순수 함수**다 — 발판의 자리는 시각의 함수로 양쪽이 똑같이 계산한다.
 * 그래서 서버는 사람이 보낸 move(x·z·y, 10Hz)만으로 착지를 판정하고, 클라는 스냅샷을 기다리지 않고 제 프레임마다 발판을 그린다
 * (낙하 생존처럼 스냅샷으로 보내면 보간 지연 120ms 만큼 발판이 늦게 보여 중앙 착지가 운이 된다 — 발판은 초당 2m 까지 움직인다).
 *
 * 숨기는 값이 없다 — 발판 속도는 눈에 보이는 것이라 P8 의 비밀이 아니다. 라운드 배속(pace)은 trial_round_start 에 공개로 실리고,
 * 20초 구간마다 배속이 바뀌는 표(PLATFORM_PHASE_SPEED)도 공개다. 기록(condition)에는 그 둘을 그대로 적는다.
 *
 * 좌표: 발판 열은 홀 가운데를 z 로 지른다 — 출발 발판(정지) z 7, 움직이는 발판 일곱이 2m 간격, 도착 발판(정지) z −9.
 * 걷기 점프가 딱 2m 다 (WALK_SPEED 2.6 × 체공 0.75s ≈ 1.95m) — 달리기(5.2)로 뛰면 두 칸을 건넌다.
 */

import { GRAVITY, JUMP_SPEED, TRIAL_PHASE_MS, WALK_SPEED } from './constants';

/** 마당 — 발판 열 둘레. FreeRig 가 발을 여기 안에 가둔다 */
export const PLATFORM_ARENA = { minX: -6, maxX: 6, minZ: -11, maxZ: 9 } as const;
/** 발판 윗면 높이(m). STEP_UP(0.55) 아래라 바닥에서 걸어 올라설 수 있다 — 떨어져도 다시 오른다 */
export const PAD_TOP = 0.5;
/** 발판 반지름(m) — 착지 판정 반경. 모델(hover_pad)의 지름을 이만큼으로 세운다 */
export const PAD_R = 0.8;
/** 「정중앙」 — 발판 중심에서 이 거리(m) 안이면 중앙 착지 */
export const PAD_CENTER_R = 0.25;
/** 발판 사이(z, m) */
export const PAD_GAP = 2;
/** 출발 발판 z · 발판 수(출발·도착 포함) */
export const PAD_START_Z = 7;
export const PAD_COUNT = 9;
/** 점프 체공(초)과 걷기 점프 거리(m) — 봇이 쓰는 값. 사람은 FreeRig 의 물리 그대로 */
export const JUMP_AIR_S = (2 * JUMP_SPEED) / GRAVITY;
export const WALK_JUMP_M = WALK_SPEED * JUMP_AIR_S;
/** 20초 구간마다 발판 속도 배율 — 공개. 1구간이 기준 */
export const PLATFORM_PHASE_SPEED: readonly number[] = [1, 1.4, 0.7];
/** 라운드 강도(1~3) → 기본 배속 */
export const PLATFORM_PACE: readonly number[] = [1, 1.35, 1.7];

export interface PadSpec {
  /** 발판 번호 (0 출발 … PAD_COUNT−1 도착) */
  k: number;
  z: number;
  /** 좌우 진폭(m). 0 이면 정지 */
  amp: number;
  /** 각속도(rad/s, 배속 1 기준) */
  omega: number;
  /** 위상(rad) */
  phi: number;
}

/**
 * 발판 열 — 서로 다른 속도·진폭·위상. 옆의 발판과 같은 박자가 되지 않게 주기를 서로 어긋난 값으로 잡았다
 * (주기 초: 5.2 · 3.6 · 6.4 · 2.9 · 4.4 · 3.2 · 5.6). 출발·도착은 정지.
 */
const PERIODS = [0, 5.2, 3.6, 6.4, 2.9, 4.4, 3.2, 5.6, 0];
const AMPS = [0, 1.6, 2.0, 1.3, 2.2, 1.5, 1.9, 1.4, 0];
const PHIS = [0, 0.3, 2.1, 4.0, 1.2, 5.3, 3.3, 0.8, 0];
export const PADS: readonly PadSpec[] = Array.from({ length: PAD_COUNT }, (_, k) => ({
  k,
  z: PAD_START_Z - k * PAD_GAP,
  amp: AMPS[k],
  omega: PERIODS[k] > 0 ? (Math.PI * 2) / PERIODS[k] : 0,
  phi: PHIS[k],
}));

/**
 * 배속을 적분한 시간(초) — 구간이 바뀔 때 속도만 바뀌고 자리는 이어지게, sin 의 인자를 「배속 × 흐른 시간」의 누적으로 잡는다.
 * (배속을 그냥 곱하면 구간 경계에서 발판이 순간이동한다)
 */
export function scaledTime(elapsedMs: number, pace: number): number {
  let s = 0;
  let left = Math.max(0, elapsedMs);
  for (let i = 0; i < PLATFORM_PHASE_SPEED.length && left > 0; i++) {
    const last = i === PLATFORM_PHASE_SPEED.length - 1;
    const span = last ? left : Math.min(left, TRIAL_PHASE_MS);
    s += (span / 1000) * PLATFORM_PHASE_SPEED[i] * pace;
    left -= span;
  }
  return s;
}

/** 지금 구간의 배속(초당 sin 인자 증가율의 배율) — 발판 속도를 구할 때 */
export function paceAt(elapsedMs: number, pace: number): number {
  const i = Math.min(PLATFORM_PHASE_SPEED.length - 1, Math.max(0, Math.floor(elapsedMs / TRIAL_PHASE_MS)));
  return PLATFORM_PHASE_SPEED[i] * pace;
}

export interface PadPose {
  k: number;
  x: number;
  z: number;
  /** x 속도(m/s) — 오차 방향(일찍/늦게)을 재는 기준 */
  vx: number;
}

/** 발판 k 의 자리 — elapsedMs 는 라운드 시작 뒤 흐른 ms, pace 는 라운드 배속 */
export function padAt(k: number, elapsedMs: number, pace: number): PadPose {
  const p = PADS[k];
  if (!p || p.amp === 0) return { k, x: 0, z: p?.z ?? 0, vx: 0 };
  const s = scaledTime(elapsedMs, pace);
  const a = p.omega * s + p.phi;
  return { k, x: p.amp * Math.sin(a), z: p.z, vx: p.amp * p.omega * Math.cos(a) * paceAt(elapsedMs, pace) };
}

export function padsAt(elapsedMs: number, pace: number): PadPose[] {
  return PADS.map((p) => padAt(p.k, elapsedMs, pace));
}

export interface PadHit extends PadPose {
  /** 중심에서 떨어진 거리(m)와 그 벡터 */
  dist: number;
  dx: number;
  dz: number;
}

/** (x, z) 아래에 발판이 있나 — 있으면 그 발판과 중심 오차. 발판은 겹치지 않으므로 첫 것 */
export function padUnder(x: number, z: number, elapsedMs: number, pace: number): PadHit | null {
  for (const p of PADS) {
    if (Math.abs(z - p.z) > PAD_R) continue;
    const pose = padAt(p.k, elapsedMs, pace);
    const dx = x - pose.x;
    const dz = z - pose.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= PAD_R) return { ...pose, dist, dx, dz };
  }
  return null;
}

/** 발 높이 y 에서 (x, z) 의 바닥 — 발판 위(발이 윗면 근처 이상)면 PAD_TOP, 아니면 0 */
export function platformGroundAt(x: number, z: number, feetY: number, elapsedMs: number, pace: number): number {
  const hit = padUnder(x, z, elapsedMs, pace);
  return hit && feetY >= PAD_TOP - 0.02 ? PAD_TOP : 0;
}

/**
 * 오차 방향 — 착지점이 발판의 **진행 방향 앞**이면 +(일찍 뛰었다: 발판이 아직 안 왔다), 뒤면 −(늦었다). 발판이 서 있으면 0
 */
export function landingSign(hit: PadHit): number {
  if (Math.abs(hit.vx) < 1e-3) return 0;
  return Math.sign(hit.dx * hit.vx);
}
