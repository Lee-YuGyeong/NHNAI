/**
 * 무게 중심 다리의 물리 — 순수 함수. 범용 엔진 없이 **판자에 붙은 좌표계**에서 직접 적분한다.
 *
 * 판자는 축 하나(x 축) 둘레로만 돈다. 판자 위의 점은 (u, v) 로 산다 — u 는 축에서 길이 방향(±SEESAW_HALF), v 는 폭 방향.
 * 기울기 φ 가 양수면 +u 끝이 올라가 있다. 월드 자리는 x = cx + v · z = cz + u·cos φ · y = TOP + u·sin φ.
 *
 *   판자 (강체 회전):   I·α = −g·cos φ·Σ mᵢuᵢ − c·ω − M·g·h·sin φ
 *     - 첫 항이 **무게중심 · 토크**다. 무리가 한쪽에 몰리면 Σ mᵢuᵢ 가 커져 그쪽이 내려간다 (사용자 스펙 "━━━━━●━━━━━ → ╲━━━━●━━━━").
 *       무거운 몸(mp/bodies.ts mass 1.8)은 같은 자리에서 1.8배 무겁다 — 비만 군인 하나가 보통 둘 몫을 한다.
 *     - 둘째는 축 마찰(감쇠), 셋째는 축이 무게중심보다 h 만큼 위인 데서 오는 복원력 — 빈 판은 수평으로 돌아오지만
 *       사람 하나가 끝에 서면 이긴다. 그러니 **균형은 사람들이 맞춰야 한다.**
 *     - |φ| 가 상한(SEESAW_TILT_MAX)에 닿으면 멈춤쇠가 받는다. 세게 닿으면(|ω| > SEESAW_JOLT_OMEGA) 판이 들썩여 판 위 모든 발에
 *       낮은 쪽으로 미끄러짐이 얹힌다 (SEESAW_JOLT) — 끝에 서 있던 사람은 그대로 밀려 떨어진다.
 *
 *   몸 (경사면 위의 점):  경사 방향 중력 gₛ = −g·sin φ (낮은 쪽으로). 발이 낼 수 있는 마찰 가속도의 상한은 μ·g·cos φ 다.
 *     - 가만히 서든 일정하게 걷든 경사에서 자리를 지키는 데 드는 마찰은 |gₛ| = g|sin φ| 다. 그래서 **tan φ ≤ μ 면 발이 잡고**,
 *       넘으면 넘친 만큼 낮은 쪽으로 미끄러짐 s 가 자란다. 미끄러지는 중이면 운동 마찰 μg cos φ 가 **바닥 대비 실제 속도
 *       (걷기 + s)** 의 반대로 걸린다 — 마찰 예산은 하나라 미끄러지는 동안 걷기 견인력은 따로 남지 않는다 (회전 원판과 같은 규칙).
 *     - 폭 방향(v)은 평평하고 난간이 있다 — 미끄러지지 않고 떨어지지도 않는다. 이 판의 물리는 길이 방향 하나다.
 *     - |u| 가 절반 길이를 넘으면 끝에서 떨어진다. 2.5초 뒤 축 옆(SEESAW_RESPAWN_U)에 다시 선다 — 축 옆은 토크가 없다.
 *
 *   상자 (화물): 크레인이 내려놓는 질량 덩어리. 닿은 뒤부터 토크에 들고, 사람과 같은 μ 로 미끄러진다 — 기울면 낮은 쪽으로
 *     흘러 끝에서 떨어진다(그러면 그 무게가 갑자기 사라져 판이 되튄다). 머무는 시간이 지나면 크레인이 다시 걷어 간다.
 *
 * 숨은 값은 **μ 하나**(condition.ts 의 SEESAW_GRIP, 20초 구간마다 바뀐다). 판의 기울기 · 각속도는 눈에 보이는 것이라 비밀이 아니고
 * 스냅샷에 그대로 실린다. 사람의 자리도 서버가 적분해 내려 보내고 클라는 걷기 명령(월드 기준 속도)만 올린다 — 미끄러짐은
 * μ 없이는 계산할 수 없다 (features/trial/games/seesaw/SeesawRig).
 */
import {
  SEESAW_COM_DROP,
  SEESAW_CRATE_MASS,
  SEESAW_DAMPING,
  SEESAW_HALF,
  SEESAW_HALF_W,
  SEESAW_INERTIA,
  SEESAW_JOLT,
  SEESAW_JOLT_OMEGA,
  SEESAW_PLANK_MASS,
  SEESAW_RESPAWN_MS,
  SEESAW_RESPAWN_U,
  SEESAW_RUN_SPEED,
  SEESAW_TILT_MAX,
  SEESAW_TOP,
} from '../../../../src/world/mp/constants';
import { SEESAW_GRIP } from '../condition';

export const G = 9.8;
/** 사람 몸 반지름(m) — 난간에 이만큼 못 붙는다 */
export const BODY_R = 0.35;
/** 「미끄러지는 중」으로 보는 속도(m/s) — 기록(에피소드)의 문턱 */
export const SLIDE_ON = 0.15;
export const SLIDE_OFF = 0.05;

export function gripForPhase(phase: number): number {
  return SEESAW_GRIP[phase - 1] ?? SEESAW_GRIP[0];
}

/* ───────────────────────────── 판자 ───────────────────────────── */

export interface Plank {
  /** 기울기(rad) — +u 끝이 올라가면 양수 */
  phi: number;
  /** 각속도(rad/s) */
  omega: number;
}

export function makePlank(): Plank {
  return { phi: 0, omega: 0 };
}

/** 판 위의 무게 하나 — 토크 계산에 드는 것은 자리(u)와 질량뿐이다 */
export interface Load {
  u: number;
  mass: number;
}

/** 판 위 무게들이 만드는 토크(N·m, +φ 방향) — 무게중심이 +u 쪽이면 음수(그쪽이 내려간다) */
export function torqueOf(loads: readonly Load[], phi: number): number {
  let sum = 0;
  for (const l of loads) sum += l.mass * l.u;
  return -G * Math.cos(phi) * sum;
}

export interface PlankOut {
  alpha: number;
  /** 이번 틱에 멈춤쇠에 닿았나 — 세게 닿았으면(들썩임) 그 방향의 미끄러짐 impulse(m/s), 아니면 0 */
  jolt: number;
}

/** 한 틱 — 토크 · 감쇠 · 복원력으로 각속도를 적분하고, 상한에 닿으면 멈춤쇠가 받는다 */
export function stepPlank(p: Plank, loads: readonly Load[], dtSec: number): PlankOut {
  const tau = torqueOf(loads, p.phi) - SEESAW_DAMPING * p.omega - SEESAW_PLANK_MASS * G * SEESAW_COM_DROP * Math.sin(p.phi);
  const alpha = tau / SEESAW_INERTIA;
  p.omega += alpha * dtSec;
  p.phi += p.omega * dtSec;
  let jolt = 0;
  if (Math.abs(p.phi) >= SEESAW_TILT_MAX) {
    const sgn = Math.sign(p.phi);
    p.phi = sgn * SEESAW_TILT_MAX;
    if (p.omega * sgn > 0) {
      // 멈춤쇠 — 그 방향의 각속도를 잃는다(조금 되튄다). 세게 닿았으면 판 위의 발이 낮은 쪽으로 밀린다
      if (Math.abs(p.omega) > SEESAW_JOLT_OMEGA) jolt = -sgn * SEESAW_JOLT;
      p.omega = -p.omega * 0.2;
    }
  }
  return { alpha, jolt };
}

/* ───────────────────────────── 몸 ───────────────────────────── */

/** 판 위 몸 하나의 상태 — 자리 · 미끄러짐은 **판자 좌표**, 걷기 명령은 월드 좌표(사람이 보는 것) */
export interface SeesawBody {
  id: string;
  /** 판자 좌표 자리 */
  u: number;
  v: number;
  /** 길이 방향 미끄러짐 속도(m/s) */
  s: number;
  /** 몸의 질량(kg) — 기준 × 몸 배율 */
  mass: number;
  /** 걷기 명령(월드 좌표, m/s). 사람은 trial_walk 로, AI 는 npc.ts 가 쓴다 */
  wx: number;
  wz: number;
  running: boolean;
  wAt: number;
  /** 판 위에 있나. 아니면 떨어져서 다시 오르길 기다리는 중 */
  on: boolean;
  fallenUntil: number;
  /** 떨어진 자리(판자 좌표 그대로 — 클라는 그 밑 바닥에 눕힌다) */
  fu: number;
  fv: number;
  falls: number;
}

export function makeBody(id: string, u: number, v = 0, mass = 75): SeesawBody {
  return { id, u, v, s: 0, mass, wx: 0, wz: 0, running: false, wAt: 0, on: true, fallenUntil: 0, fu: 0, fv: 0, falls: 0 };
}

/** 걷기 명령을 상한으로 자른다 — 위조돼도 「빨리 걷기」 이상이 안 된다 (protocol.ts trial_walk) */
export function clampWalk(x: number, z: number, cap = SEESAW_RUN_SPEED): { x: number; z: number } {
  const len = Math.hypot(x, z);
  if (!Number.isFinite(len) || len < 1e-6) return { x: 0, z: 0 };
  const k = len > cap ? cap / len : 1;
  return { x: x * k, z: z * k };
}

export interface StepOut {
  /** 이번 틱에 실제로 먹은 걷기(판자 좌표, m/s) — 기록(이동거리)에 쓴다 */
  wu: number;
  wv: number;
  /** 이번 틱에 필요했던 마찰 가속도(m/s²) — 봇이 「얼마나 아슬아슬한가」를 읽는다 */
  need: number;
  fell: boolean;
}

/**
 * 경사면 위 한 점의 길이 방향 미끄러짐 한 틱 — 몸과 상자가 같이 쓴다.
 * @param s 지금 미끄러짐(m/s) @param wu 길이 방향 걷기(상자는 0) @returns 새 미끄러짐과 필요했던 마찰
 */
export function slideStep(s: number, wu: number, phi: number, mu: number, dtSec: number): { s: number; need: number } {
  const gS = -G * Math.sin(phi); // 낮은 쪽으로
  const need = Math.abs(gS);
  const grip = mu * G * Math.cos(phi);
  if (Math.abs(s) < SLIDE_OFF) {
    if (need > grip) return { s: s + gS * ((need - grip) / need) * dtSec, need };
    return { s: 0, need };
  }
  // 이미 미끄러지는 중 — 운동 마찰은 바닥 대비 실제 속도 u = w + s 의 반대로
  const uvel = wu + s;
  const ns = s + (gS - grip * Math.sign(uvel)) * dtSec;
  // 마찰이 실제 속도를 지나쳐 뒤집으면 바닥에 대해 멈춘 것이다
  if ((ns + wu) * uvel < 0) return { s: -wu, need };
  return { s: ns, need };
}

/**
 * 한 틱. 걷기 명령(월드 좌표)을 판자 좌표로 넣고(길이 = z, 폭 = x), 경사 − 마찰 → 미끄러짐 → 자리를 적분한다.
 * @param jolt 이번 틱 멈춤쇠 들썩임(m/s, 부호 있음) — 발에 그대로 얹힌다
 */
export function stepBody(b: SeesawBody, wu: number, wv: number, phi: number, mu: number, dtSec: number, now: number, jolt = 0): StepOut {
  if (!b.on) return { wu: 0, wv: 0, need: 0, fell: false };
  if (jolt !== 0) b.s += jolt;
  const out = slideStep(b.s, wu, phi, mu, dtSec);
  b.s = out.s;
  b.u += (wu + b.s) * dtSec;
  b.v += wv * dtSec;
  // 난간 — 폭 방향은 막힌다
  const vMax = SEESAW_HALF_W - BODY_R;
  if (b.v > vMax) b.v = vMax;
  else if (b.v < -vMax) b.v = -vMax;

  let fell = false;
  if (Math.abs(b.u) > SEESAW_HALF) {
    fell = true;
    b.on = false;
    b.falls += 1;
    b.fallenUntil = now + SEESAW_RESPAWN_MS;
    b.fu = Math.sign(b.u) * (SEESAW_HALF + 0.6);
    b.fv = b.v;
    b.s = 0;
  }
  return { wu, wv, need: out.need, fell };
}

/** 떨어진 몸을 축 옆에 다시 세운다 — 떨어진 쪽 그대로. 축 옆이라 토크가 거의 없다 */
export function respawn(b: SeesawBody): void {
  b.u = Math.sign(b.fu || 1) * SEESAW_RESPAWN_U;
  b.v = 0;
  b.s = 0;
  b.on = true;
  b.fallenUntil = 0;
}

/** 판자 좌표 → 월드 자리와 발 높이. 떨어졌으면 판 끝 밑 바닥 */
export function worldOf(u: number, v: number, phi: number, center: { x: number; z: number }, on = true): { x: number; y: number; z: number } {
  if (!on) return { x: center.x + v, y: 0, z: center.z + u };
  return { x: center.x + v, y: SEESAW_TOP + u * Math.sin(phi), z: center.z + u * Math.cos(phi) };
}

/* ───────────────────────────── 상자 ───────────────────────────── */

export interface Crate {
  id: number;
  u: number;
  v: number;
  s: number;
  mass: number;
  /** 판에 닿는 시각 — 그 전에는 크레인에서 내려오는 중(무게 없음) */
  landAt: number;
  /** 크레인이 다시 걷어 가는 시각 */
  liftAt: number;
}

export function makeCrate(id: number, u: number, v: number, landAt: number, liftAt: number, mass = SEESAW_CRATE_MASS): Crate {
  return { id, u, v, s: 0, mass, landAt, liftAt };
}

/** 상자 한 틱 — 닿은 뒤부터 미끄러진다. 끝을 넘으면 true(떨어졌다 — 지운다) */
export function stepCrate(c: Crate, phi: number, mu: number, dtSec: number, now: number): boolean {
  if (now < c.landAt) return false;
  c.s = slideStep(c.s, 0, phi, mu, dtSec).s;
  c.u += c.s * dtSec;
  return Math.abs(c.u) > SEESAW_HALF;
}
