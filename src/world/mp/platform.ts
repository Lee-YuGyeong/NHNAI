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
 * 발판 속도는 눈에 보이는 것이라 P8 의 비밀이 아니다 — 라운드 배속(pace)은 trial_round_start 에 공개로 실리고, 20초 구간마다
 * 배속이 바뀌는 표(PLATFORM_PHASE_SPEED)도 공개다. **숨는 값은 발판 윗면의 마찰**(worker/src/trial/condition.ts 의
 * PLATFORM_GRIP)이다 — 착지한 발이 얼마나 밀리는가. μ 는 와이어에 안 나가고, 서버가 착지마다 곱셈을 끝낸
 * 미끄러짐(trial_slip: 속도와 지속 시간)만 내려보낸다.
 *
 * 좌표: 발판 열은 홀 가운데를 z 로 지른다 — 출발 발판(정지) z 7, 움직이는 발판 다섯이 2m 간격, 도착 발판(정지) z −5.
 * 여섯 번 뛰면 완주다 — 제한이 30초(PLATFORM_GAME_MS)라 사람이 한 번 떨어져 출발로 돌아가도 다시 건널 시간이 있게.
 * 점프 거리 = **이륙 속도** × 체공이다. 이륙 속도는 공중에서 유지된다(FreeRig — 발이 땅에 없으면 가속도 감속도 못 한다,
 * 대신 손을 떼면 줄일 수는 있다). 체공은 몸의 점프 속도가 정한다(mp/bodies.ts): fit 은 걸어 뛰면 2.22m 로 한 칸(2m)을
 * 넘고 달려 뛰면 4.44m(두 칸 4m), 비만은 걸어 1.80m(발판 반지름 0.8m 라 다음 발판 앞쪽에 닿는다)·달려 2.70m 다.
 * 예전에는 이륙 순간 관성이 사라져 **누구든 공중에서 걷기 속도**였고, 그래서 비만 몸은 1.53m 밖에 못 가 늘 불리했다
 * (같은 실력이 몸 때문에 다르게 찍혔다). 점프 자체도 낮았다(5.6·4.4 → 6.4·5.2, 2026-09-05 사용자 — bodies.ts 머리말).
 *
 * 이 게임 안에서는 **몸끼리 부딪히지 않는다** (FreeRig — platformState.active 면 pushOut 을 안 건다). 반지름 0.8m
 * 발판 위에 몸 반지름 0.35m 넷이 서면 겹칠 수밖에 없고, 겹친 만큼 밀어내면 라운드가 열리자마자 서로를 발판 밖으로
 * 떠민다 — 남의 어깨에 밀려 떨어진 것이 내 점프 정확도로 찍히면 안 된다 (2026-09-05 사용자: 「사람을 밀치는 것」).
 */

import { BODIES } from './bodies';
import { GRAVITY, TRIAL_PHASE_MS, WALK_SPEED } from './constants';

/** 마당 — 발판 열 둘레. FreeRig 가 발을 여기 안에 가둔다 */
export const PLATFORM_ARENA = { minX: -6, maxX: 6, minZ: -11, maxZ: 9 } as const;
/** 발판 윗면 높이(m). 바닥에 떨어지면 걸어 오르는 게 아니라 출발 발판으로 돌아간다 (2026-09-05 사용자) — FreeRig · npc.ts */
export const PAD_TOP = 0.5;
/** 바닥에 떨어진 뒤 출발 발판으로 돌아가기까지(ms) — 넘어진 것이 잠깐 보인다 */
export const PLATFORM_RESPAWN_MS = 600;
/** 한 샘플(10Hz) 사이에 이만큼(m) 넘게 옮겨졌으면 걷거나 뛴 게 아니라 **돌아간 것**이다 — 달리기 5.2m/s 로도 0.52m */
export const PLATFORM_TELEPORT_M = 2.5;
/** 발판 반지름(m) — 착지 판정 반경. 모델(hover_pad)의 지름을 이만큼으로 세운다 */
export const PAD_R = 0.8;
/**
 * 출발 발판 위 네 자리 — 2×2 (x·z 로 ±0.3m). 한 줄로 0.4m 씩 세우면 양 끝이 중심에서 0.6m 라 발판 가장자리(0.8)에
 * 바짝 붙고, 몸 반지름 0.35 넷이 한 줄로는 어차피 못 선다. 2×2 면 중심에서 0.42m 안이다. 사람은 좌석 번호로,
 * 봇은 순번으로 자리를 고른다 (InterrogationFeature · worker platform/engine.ts) — 둘 다 이 표 하나를 본다.
 */
export const START_SLOTS: readonly { x: number; z: number }[] = [
  { x: -0.3, z: -0.3 },
  { x: 0.3, z: -0.3 },
  { x: -0.3, z: 0.3 },
  { x: 0.3, z: 0.3 },
];
/** n 번째(0부터) 자리 — 다섯째부터는 겹친다 */
export function startSlot(n: number): { x: number; z: number } {
  const s = START_SLOTS[((n % START_SLOTS.length) + START_SLOTS.length) % START_SLOTS.length];
  return { x: s.x, z: PAD_START_Z + s.z };
}
/** 「정중앙」 — 발판 중심에서 이 거리(m) 안이면 중앙 착지 */
export const PAD_CENTER_R = 0.25;
/** 발판 사이(z, m) */
export const PAD_GAP = 2;
/** 출발 발판 z · 발판 수(출발·도착 포함) */
export const PAD_START_Z = 7;
export const PAD_COUNT = 7;
/** 도착 발판 번호 — 여기 내리면 완주. 남은 시간은 그 위에서 기다린다 */
export const PAD_FINISH = PAD_COUNT - 1;
/**
 * 이 게임의 점프 이륙 속도(m/s) — **날씬한 몸의 것**이다 (mp/bodies.ts). 봇은 몸이 없어 이 값으로 뛰고, 사람은 제 몸의
 * 값으로 뛴다(FreeRig). 복도의 JUMP_SPEED(5.6)가 아니다 — 여기서 뛰는 몸은 군인이고, 그 몸의 점프가 올라갔다.
 */
export const PLATFORM_JUMP_SPEED = BODIES.sol_fit_m.jump;
/** 점프 체공(초)과 걷기 점프 거리(m) — 봇이 쓰는 값. 사람은 FreeRig 의 물리 그대로 */
export const JUMP_AIR_S = (2 * PLATFORM_JUMP_SPEED) / GRAVITY;
export const WALK_JUMP_M = WALK_SPEED * JUMP_AIR_S;
/** 달려서 뛴 거리(m) — 이륙 속도가 공중에서 유지되므로 몸의 달리기 속도 × 체공이다 (mp/bodies.ts BODIES[].run) */
export function runJumpM(runSpeed: number, airS = JUMP_AIR_S): number {
  return runSpeed * airS;
}
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
 * (주기 초: 5.2 · 3.6 · 6.4 · 2.9 · 4.4). 출발·도착은 정지.
 */
const PERIODS = [0, 5.2, 3.6, 6.4, 2.9, 4.4, 0];
const AMPS = [0, 1.6, 2.0, 1.3, 2.2, 1.5, 0];
const PHIS = [0, 0.3, 2.1, 4.0, 1.2, 5.3, 0];
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
