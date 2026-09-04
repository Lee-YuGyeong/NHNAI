/**
 * 회전 원판 생존의 물리 — 순수 함수. 범용 엔진 없이 **원판에 붙은 회전 좌표계**에서 직접 적분한다.
 *
 * 원판 위의 사람은 원판 좌표(p)로 산다. 원판이 θ 만큼 돌아 있으면 월드 자리는 rot(θ)·p 다. 회전 좌표계에서 몸에 걸리는
 * 겉보기 가속도(의사힘)는 셋이다 — 원심(ω²p, 바깥) · 오일러(각가속도 α 가 있을 때 접선 방향으로 −α ẑ×p) · 코리올리
 * (원판 기준으로 움직이는 속도 u 에 −2ω ẑ×u). 발이 낼 수 있는 마찰 가속도의 상한이 μg 다:
 *
 *   필요한 마찰 F = (걷기 명령 w 를 유지하는 데 드는 가속도) − (의사힘)
 *     - 가만히 서 있으면(w=0) F = −ω²p → |F| = ω²r. 그래서 **가운데 가까이가 안정**하고, 가장자리는 각속도가 조금만 올라도 미끄러진다
 *     - 회전 반대 방향으로 원판 속도(ωr)로 달리면(w = −Ω×p) 코리올리가 원심을 정확히 지워 F = 0 — 월드에서 보면 제자리에 서 있는 것과
 *       같으니 마찰이 필요 없다. 그 절반 속도면 |F| 도 절반이다 (사용자 스펙: "반대 방향으로 뛰면서 버팀")
 *   |F| ≤ μg 면 발이 잡는다(정지 마찰). 넘으면 넘친 만큼 미끄러짐 속도 s 가 자란다. 이미 미끄러지는 중이면 운동 마찰 μg 가 s 반대로 걸린다.
 *
 * 숨은 값은 **μ 하나**(condition.ts 의 DISC_GRIP, 20초 구간마다 바뀐다). 각속도 스케줄은 눈에 보이는 것이라 비밀이 아니고 (스냅샷에
 * θ·ω 가 그대로 실린다), 사람의 자리도 서버가 적분해 내려 보낸다 — 클라는 걷기 명령(월드 기준 속도)만 올린다. 미끄러짐은 μ 없이는
 * 계산할 수 없으므로 클라는 서버가 준 s 로 다음 스냅샷까지 제 몸을 예측할 뿐이다 (features/trial/games/disc/DiscRig).
 */
import { DISC_BODY_R, DISC_HUB_R, DISC_OMEGA_MAX, DISC_R, DISC_RESPAWN_MS, DISC_RESPAWN_R, DISC_RUN_SPEED, DISC_TOP } from '../../../../src/world/mp/constants';
import { DISC_GRIP } from '../condition';

export const G = 9.8;
/** 발이 설 수 있는 가장 안쪽 반지름 — 기둥 둘레 */
export const MIN_R = DISC_HUB_R + DISC_BODY_R;
/** 「미끄러지는 중」으로 보는 속도(m/s) — 기록(에피소드)의 문턱 */
export const SLIDE_ON = 0.15;
export const SLIDE_OFF = 0.05;

export function gripForPhase(phase: number): number {
  return DISC_GRIP[phase - 1] ?? DISC_GRIP[0];
}

export interface Vec2 {
  x: number;
  z: number;
}

/** 원판 좌표 → 월드 좌표 (three.js rotation.y = θ 와 같은 회전). 중심은 더하지 않는다 */
export function rot(theta: number, v: Vec2): Vec2 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: v.x * c + v.z * s, z: -v.x * s + v.z * c };
}

/** Ω × v — 각속도 ω(+y 축)가 v 에 걸어 주는 접선 방향. rot(θ) 의 시간 미분과 같은 방향이다 */
export function cross(omega: number, v: Vec2): Vec2 {
  return { x: omega * v.z, z: -omega * v.x };
}

/** 원판 위 몸 하나의 상태 — 자리·미끄러짐은 **원판 좌표**, 걷기 명령은 월드 좌표(사람이 보는 것) */
export interface DiscBody {
  id: string;
  /** 원판 좌표 자리 */
  px: number;
  pz: number;
  /** 미끄러짐 속도(원판 좌표, m/s) */
  sx: number;
  sz: number;
  /** 걷기 명령(월드 좌표, m/s). 사람은 trial_walk 로, AI 는 npc.ts 가 쓴다 */
  wx: number;
  wz: number;
  /** 달리기(Shift)로 온 명령인가 — 스냅샷의 m 에만 쓴다 */
  running: boolean;
  /** 걷기 명령이 마지막으로 온 시각 — 오래되면 손을 뗀 것으로 본다 */
  wAt: number;
  /** 원판 위에 있나. 아니면 떨어져서 다시 오르길 기다리는 중 */
  on: boolean;
  fallenUntil: number;
  /** 떨어진 자리(월드) — 떨어진 동안 그 자리에 누워 있다 */
  fx: number;
  fz: number;
  falls: number;
}

export function makeBody(id: string, angle: number, r = DISC_RESPAWN_R): DiscBody {
  return {
    id,
    px: Math.cos(angle) * r,
    pz: Math.sin(angle) * r,
    sx: 0,
    sz: 0,
    wx: 0,
    wz: 0,
    running: false,
    wAt: 0,
    on: true,
    fallenUntil: 0,
    fx: 0,
    fz: 0,
    falls: 0,
  };
}

/** 걷기 명령을 상한으로 자른다 — 위조돼도 「빨리 걷기」 이상이 안 된다 (protocol.ts trial_walk) */
export function clampWalk(x: number, z: number, cap = DISC_RUN_SPEED): Vec2 {
  const len = Math.hypot(x, z);
  if (!Number.isFinite(len) || len < 1e-6) return { x: 0, z: 0 };
  const k = len > cap ? cap / len : 1;
  return { x: x * k, z: z * k };
}

export interface StepOut {
  /** 이번 틱의 걷기(원판 좌표, m/s) — 기록(이동거리)에 쓴다 */
  wx: number;
  wz: number;
  /** 이번 틱에 필요했던 마찰 가속도 |F| (m/s²) — 봇이 「얼마나 아슬아슬한가」를 읽는다 */
  need: number;
  /** 이번 틱에 떨어졌나 */
  fell: boolean;
}

/**
 * 한 틱. 걷기 명령(월드 좌표)을 원판 좌표로 돌려 넣고, 의사힘 − 마찰 → 미끄러짐 → 자리를 적분한다.
 * @param wDisc 원판 좌표 걷기 속도 — 사람은 월드 명령을 rot(−θ) 로 돌린 것, 봇은 바로 원판 좌표로 준다
 */
export function stepBody(b: DiscBody, wDisc: Vec2, omega: number, alpha: number, mu: number, dtSec: number, now: number): StepOut {
  if (!b.on) {
    return { wx: 0, wz: 0, need: 0, fell: false };
  }
  const p: Vec2 = { x: b.px, z: b.pz };
  const w = wDisc;
  const u: Vec2 = { x: w.x + b.sx, z: w.z + b.sz };

  // 의사힘 (회전 좌표계) — 원심 + 오일러 + 코리올리
  const cw = cross(omega, w); // Ω × w
  const cp = cross(alpha, p); // (dΩ/dt) × p
  const cu = cross(omega, u); // Ω × u
  const apx = omega * omega * p.x - cp.x - 2 * cu.x;
  const apz = omega * omega * p.z - cp.z - 2 * cu.z;
  // 걷기 명령을 원판 좌표에서 유지하는 데 드는 가속도 = −Ω × w (월드에서 일정한 속도는 원판에서 돈다)
  const fx = -cw.x - apx;
  const fz = -cw.z - apz;
  const need = Math.hypot(fx, fz);
  const grip = mu * G;

  const slide = Math.hypot(b.sx, b.sz);
  if (slide < SLIDE_OFF) {
    if (need > grip) {
      // 정지 마찰이 못 잡는다 — 넘친 만큼 미끄러지기 시작한다 (F 의 반대쪽 = 의사힘 쪽)
      const k = (need - grip) / need;
      b.sx += -fx * k * dtSec;
      b.sz += -fz * k * dtSec;
    } else {
      b.sx = 0;
      b.sz = 0;
    }
  } else {
    // 이미 미끄러지는 중 — 운동 마찰이 s 의 반대로 μg 만큼 건다
    const ux = b.sx / slide;
    const uz = b.sz / slide;
    const nsx = b.sx + (-fx - grip * ux) * dtSec;
    const nsz = b.sz + (-fz - grip * uz) * dtSec;
    // 마찰이 s 를 지나쳐 뒤집으면 멈춘 것이다
    if (nsx * b.sx + nsz * b.sz < 0) {
      b.sx = 0;
      b.sz = 0;
    } else {
      b.sx = nsx;
      b.sz = nsz;
    }
  }

  // 자리 적분은 극좌표로 — 접선 방향 속도(회전 반대로 달리기)를 직선 스텝으로 더하면 다각형 오차로 매 틱 바깥으로 샌다.
  // 반지름은 반지름 성분으로, 각도는 접선 성분 / r 로 돌리면 원운동이 정확히 원이 된다
  {
    const ux = w.x + b.sx;
    const uz = w.z + b.sz;
    const r0 = Math.hypot(b.px, b.pz);
    if (r0 > 1e-6) {
      const nx = b.px / r0;
      const nz = b.pz / r0;
      const ur = ux * nx + uz * nz;
      const ut = ux * -nz + uz * nx;
      const r1 = Math.max(0, r0 + ur * dtSec);
      const a1 = Math.atan2(b.pz, b.px) + ((ut * dtSec) / Math.max(r0, 0.2)) * 1;
      b.px = Math.cos(a1) * r1;
      b.pz = Math.sin(a1) * r1;
    } else {
      b.px += ux * dtSec;
      b.pz += uz * dtSec;
    }
  }

  // 기둥 — 안으로는 못 들어간다. 안쪽으로 향하던 미끄러짐은 기둥이 받는다
  const r = Math.hypot(b.px, b.pz);
  if (r < MIN_R) {
    const k = r < 1e-6 ? 1 : MIN_R / r;
    if (r < 1e-6) {
      b.px = MIN_R;
      b.pz = 0;
    } else {
      b.px *= k;
      b.pz *= k;
    }
    const nx = b.px / MIN_R;
    const nz = b.pz / MIN_R;
    const inward = b.sx * nx + b.sz * nz;
    if (inward < 0) {
      b.sx -= inward * nx;
      b.sz -= inward * nz;
    }
  }

  // 가장자리 — 몸 중심이 반지름을 넘으면 떨어진다
  let fell = false;
  if (Math.hypot(b.px, b.pz) > DISC_R) {
    fell = true;
    b.on = false;
    b.falls += 1;
    b.fallenUntil = now + DISC_RESPAWN_MS;
    b.sx = 0;
    b.sz = 0;
  }
  return { wx: w.x, wz: w.z, need, fell };
}

/** 떨어진 몸을 기둥 둘레 가까이 다시 세운다 — 떨어진 각도 그대로 */
export function respawn(b: DiscBody): void {
  const a = Math.atan2(b.pz, b.px);
  b.px = Math.cos(a) * DISC_RESPAWN_R;
  b.pz = Math.sin(a) * DISC_RESPAWN_R;
  b.sx = 0;
  b.sz = 0;
  b.on = true;
  b.fallenUntil = 0;
}

/** 몸의 월드 자리 (중심 포함) 와 발 높이 */
export function worldOf(b: DiscBody, theta: number, center: Vec2): { x: number; z: number; y: number } {
  if (!b.on) return { x: b.fx, z: b.fz, y: 0 };
  const w = rot(theta, { x: b.px, z: b.pz });
  return { x: center.x + w.x, z: center.z + w.z, y: DISC_TOP };
}

/* ───────────────────────────── 각속도 스케줄 ───────────────────────────── */

/**
 * 원판의 회전 — 불규칙하게 바뀐다(사용자 스펙). 목표 각속도를 뽑아 일정한 각가속도로 그리로 가고, 잠시 유지한 뒤 다시 뽑는다.
 * 방향이 자주 뒤집히고(60%) 가끔 멈춘다(12%). 각가속도가 곧 오일러 힘이라, 급하게 바뀌는 순간이 가장 위험하다.
 */
export interface Spin {
  theta: number;
  omega: number;
  target: number;
  /** 각가속도 크기(rad/s²) */
  rate: number;
  holdUntil: number;
}

export function makeSpin(now: number, rand: () => number = Math.random): Spin {
  const s: Spin = { theta: 0, omega: 0, target: 0, rate: 1, holdUntil: 0 };
  retarget(s, now, rand);
  return s;
}

/** 새 목표를 뽑는다. 돌려주는 값은 목표의 변화량(rad/s) — 기록이 「회전이 바뀐 사건」으로 삼는다 */
export function retarget(s: Spin, now: number, rand: () => number): number {
  const before = s.target;
  const roll = rand();
  let target: number;
  if (roll < 0.12) target = 0;
  else {
    const mag = 0.35 + rand() * (DISC_OMEGA_MAX - 0.35);
    const flip = rand() < 0.6;
    const sign = s.target === 0 ? (rand() < 0.5 ? -1 : 1) : flip ? -Math.sign(s.target) : Math.sign(s.target);
    target = sign * mag;
  }
  s.target = target;
  s.rate = 0.5 + rand() * 1.1;
  const rampMs = (Math.abs(target - s.omega) / s.rate) * 1000;
  s.holdUntil = now + rampMs + 1500 + rand() * 3000;
  return target - before;
}

/** 한 틱 — 각속도를 목표로 몰고 각도를 적분한다. 돌려주는 값은 이번 틱의 각가속도 α (부호 있음) 와, 목표가 새로 뽑혔으면 그 변화량 */
export function stepSpin(s: Spin, now: number, dtSec: number, rand: () => number = Math.random): { alpha: number; changed: number } {
  let changed = 0;
  if (now >= s.holdUntil) changed = retarget(s, now, rand);
  const d = s.target - s.omega;
  let alpha = 0;
  if (Math.abs(d) > s.rate * dtSec) {
    alpha = Math.sign(d) * s.rate;
    s.omega += alpha * dtSec;
  } else {
    s.omega = s.target;
  }
  s.theta += s.omega * dtSec;
  // 각도는 계속 자라도 되지만 부동소수 정밀도를 위해 2π 로 접는다 — 클라는 스냅샷 사이만 외삽하므로 불연속이 문제되지 않는다
  if (s.theta > Math.PI * 4) s.theta -= Math.PI * 4;
  else if (s.theta < -Math.PI * 4) s.theta += Math.PI * 4;
  return { alpha, changed };
}
