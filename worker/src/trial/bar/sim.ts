/**
 * 회전 봉 넘기의 물리 — 순수 함수. 무대는 돌지 않으므로 회전 좌표계가 필요 없다(원판과 다른 점 하나).
 *
 * 수직축에는 숨은 값이 없다: 중력(BAR_GRAVITY 9.8)과 이륙 속도(몸의 jump × BAR_JUMP_SCALE)는 전부 공개 상수다 —
 * 봉의 속도도 눈에 보인다(스냅샷의 θ·ω). 숨은 것은 **발밑 하나**다(condition.ts BAR_GRIP, 20초 구간마다 바뀐다):
 *
 *   발이 낼 수 있는 가속도의 상한이 μg 다. 실제 속도 v 는 걷기 명령 w 를 향해 틱마다 최대 μg·dt 만 다가간다 —
 *   미끄러운 구간에는 출발도 제동도 늦어 「명령대로 안 가는」 몫(v − w)이 자란다. 그 몫이 스냅샷의 s 다(P8:
 *   마찰계수 대신 곱셈이 끝난 결과만 나간다). 공중에서는 발이 바닥에 없으므로 v 가 그대로 얼어붙는다 — 달려 뛴
 *   점프는 무를 수 없고, 착지한 발은 공중에서 갖고 온 속도를 μg 로만 죽인다(착지 미끄러짐이 따로 필요 없다 —
 *   같은 식 하나가 만든다). 봉에 맞아 넘어진 몸도 같은 식이다: w = 0 인 채 BAR_SHOVE 가 μg 로 잦아든다 —
 *   미끄러운 구간에는 그게 가장자리 밖까지 간다.
 *
 * 봉의 스침 판정: 몸의 각도와 봉의 각도의 상대각(rel)이 틱 사이에 0 을 지나면 봉이 그 몸을 지난 것이다 —
 * 그 순간 발 높이가 BAR_HEIGHT 위면 넘었고, 아니면 맞았다. 누운 몸(down)은 봉이 위로 지나간다.
 */
import { BAR_BODY_R, BAR_GRAVITY, BAR_HUB_R, BAR_OMEGA_MAX, BAR_OMEGA_MIN, BAR_R, BAR_RAMP_MAX, BAR_RAMP_MIN, BAR_RESPAWN_MS, BAR_RESPAWN_R } from '../../../../src/world/mp/constants';
import { BAR_GRIP } from '../condition';

export const G = BAR_GRAVITY;
/** 발이 설 수 있는 가장 안쪽 반지름 — 기둥 둘레 */
export const MIN_R = BAR_HUB_R + BAR_BODY_R;
/** 스침 검출에서 ±π 접힘을 크로싱으로 오인하지 않는 창(rad) — 한 틱에 봉이 도는 각(≤0.07)보다 훨씬 크다 */
const CROSS_WINDOW = 0.7;

export function gripForPhase(phase: number): number {
  return BAR_GRIP[phase - 1] ?? BAR_GRIP[0];
}

export interface Vec2 {
  x: number;
  z: number;
}

/** 무대 위 몸 하나 — 자리·속도는 무대 중심 기준(월드와 같은 축), 걷기 명령도 월드 좌표다 */
export interface BarBody {
  id: string;
  x: number;
  z: number;
  /** 실제 수평 속도(m/s) — 걷기 명령이 아니라 발이 실제로 낸 것 */
  vx: number;
  vz: number;
  /** 걷기 명령(월드 좌표, m/s). 사람은 trial_walk 로, AI 는 npc.ts 가 쓴다 */
  wx: number;
  wz: number;
  running: boolean;
  wAt: number;
  /** 발 높이(무대 윗면 기준, m)와 수직 속도 — 서버가 적분한다(스침 판정 대상이다) */
  y: number;
  vy: number;
  /** 이 몸의 이륙 속도(이 판의 눈금) — 무거운 몸은 낮게 뛴다 (mp/bodies.ts) */
  v0: number;
  /** 이번 점프가 시작된 시각(0 = 땅) — 체공 중심 대비 타이밍 오차를 여기서 잰다 */
  jumpAt: number;
  jumps: number;
  /** 지난 틱의 봉과의 상대각 — NaN 이면 다음 틱에 크로싱 없이 다시 잰다(막 섰다) */
  prevRel: number;
  /** 봉에 맞아 누워 있다 — 봉이 위로 지나가고, 몸은 밀린 속도로 미끄러진다 */
  down: boolean;
  downUntil: number;
  /** 무대 위에 있나. 아니면 떨어져서 다시 오르길 기다리는 중 */
  on: boolean;
  fallenUntil: number;
  /** 떨어진 자리(무대 중심 기준) — 떨어진 동안 그 자리에 누워 있다 */
  fx: number;
  fz: number;
  /** 몸이 보는 방향 — 걷는 쪽. 스냅샷의 h */
  heading: number;
  hits: number;
  falls: number;
}

export function makeBarBody(id: string, angle: number, v0: number, r = BAR_RESPAWN_R): BarBody {
  return {
    id,
    x: Math.cos(angle) * r,
    z: Math.sin(angle) * r,
    vx: 0,
    vz: 0,
    wx: 0,
    wz: 0,
    running: false,
    wAt: 0,
    y: 0,
    vy: 0,
    v0,
    jumpAt: 0,
    jumps: 0,
    prevRel: Number.NaN,
    down: false,
    downUntil: 0,
    on: true,
    fallenUntil: 0,
    fx: 0,
    fz: 0,
    heading: 0,
    hits: 0,
    falls: 0,
  };
}

/** 걷기 명령을 상한으로 자른다 — 위조돼도 「빨리 걷기」 이상이 안 된다 (disc/sim 과 같은 규칙) */
export function clampWalk(x: number, z: number, cap: number): Vec2 {
  const len = Math.hypot(x, z);
  if (!Number.isFinite(len) || len < 1e-6) return { x: 0, z: 0 };
  const k = len > cap ? cap / len : 1;
  return { x: x * k, z: z * k };
}

export interface StepOut {
  /** 이번 틱에 명령과 다르게 움직인 거리(m) — |v − w|·dt. 기록(미끄러짐)에 쓴다 */
  slid: number;
  /** 이번 틱에 실제로 움직인 거리(m) */
  moved: number;
  /** 이번 틱에 가장자리를 넘어 떨어졌나 */
  fell: boolean;
}

/**
 * 한 틱. 땅에 선 발은 v 를 w 쪽으로 μg 상한으로 끌고, 공중이면 v 를 얼린 채 포물선만 적분한다.
 * 누운 몸(down)은 w = 0 으로 친다 — 밀린 속도가 μg 로 잦아드는 것이 곧 「넘어져 미끄러지는」 것이다.
 */
export function stepBarBody(b: BarBody, mu: number, dtSec: number, now: number): StepOut {
  if (!b.on) return { slid: 0, moved: 0, fell: false };

  const airborne = b.y > 0.001 || b.vy > 0;
  const wx = b.down ? 0 : b.wx;
  const wz = b.down ? 0 : b.wz;

  if (!airborne) {
    // 발이 잡는 가속도의 상한이 μg — 명령 쪽으로 그만큼만 다가간다. 명령이 0 이면 이게 곧 제동이다
    const dx = wx - b.vx;
    const dz = wz - b.vz;
    const d = Math.hypot(dx, dz);
    const cap = mu * G * dtSec;
    if (d <= cap) {
      b.vx = wx;
      b.vz = wz;
    } else {
      b.vx += (dx / d) * cap;
      b.vz += (dz / d) * cap;
    }
  } else {
    // 공중 — 발이 바닥에 없다. 궤도는 이륙 순간 정해졌다
    b.vy -= G * dtSec;
    b.y += b.vy * dtSec;
    if (b.y <= 0 && b.vy < 0) {
      b.y = 0;
      b.vy = 0;
      b.jumpAt = 0;
    }
  }

  b.x += b.vx * dtSec;
  b.z += b.vz * dtSec;
  const slid = Math.hypot(b.vx - wx, b.vz - wz) * dtSec;
  const moved = Math.hypot(b.vx, b.vz) * dtSec;

  // 기둥 — 안으로는 못 들어간다. 안쪽으로 향하던 속도는 기둥이 받는다
  const r0 = Math.hypot(b.x, b.z);
  if (r0 < MIN_R) {
    const k = r0 < 1e-6 ? 1 : MIN_R / r0;
    if (r0 < 1e-6) {
      b.x = MIN_R;
      b.z = 0;
    } else {
      b.x *= k;
      b.z *= k;
    }
    const nx = b.x / MIN_R;
    const nz = b.z / MIN_R;
    const inward = b.vx * nx + b.vz * nz;
    if (inward < 0) {
      b.vx -= inward * nx;
      b.vz -= inward * nz;
    }
  }

  // 가장자리 — 몸 중심이 반지름을 넘으면 떨어진다
  let fell = false;
  if (Math.hypot(b.x, b.z) > BAR_R) {
    fell = true;
    b.on = false;
    b.down = false;
    b.falls += 1;
    b.fallenUntil = now + BAR_RESPAWN_MS;
    b.fx = b.x;
    b.fz = b.z;
    b.vx = 0;
    b.vz = 0;
    b.y = 0;
    b.vy = 0;
    b.jumpAt = 0;
  }
  return { slid, moved, fell };
}

/** Space — 땅에 서 있을 때만 뜬다. 누웠거나 떨어졌으면 무시한다 */
export function jump(b: BarBody, now: number): boolean {
  if (!b.on || b.down || b.y > 0.001 || b.vy > 0) return false;
  b.vy = b.v0;
  b.jumpAt = now;
  b.jumps += 1;
  return true;
}

/** 봉에 맞았다 — 눕고, 봉이 쓸어 가는 방향(접선)으로 밀린다. 미끄러짐은 stepBarBody 의 마찰이 알아서 죽인다 */
export function knockDown(b: BarBody, omega: number, shove: number, downMs: number, now: number): void {
  b.down = true;
  b.downUntil = now + downMs;
  b.y = 0;
  b.vy = 0;
  b.jumpAt = 0;
  b.hits += 1;
  // 봉 끝의 속도 방향 = ω × r̂ (disc/sim 의 cross 와 같은 축 규약)
  const r = Math.hypot(b.x, b.z);
  if (r > 1e-6) {
    const tx = (omega * b.z) / r;
    const tz = (-omega * b.x) / r;
    const t = Math.hypot(tx, tz);
    if (t > 1e-6) {
      b.vx = (tx / t) * shove;
      b.vz = (tz / t) * shove;
    }
  }
}

/** 누운 몸을 일으킨다 · 떨어진 몸을 기둥 근처에 다시 세운다 — 떨어진 각도 그대로 */
export function respawn(b: BarBody): void {
  const a = Math.atan2(b.z, b.x);
  b.x = Math.cos(a) * BAR_RESPAWN_R;
  b.z = Math.sin(a) * BAR_RESPAWN_R;
  b.vx = 0;
  b.vz = 0;
  b.y = 0;
  b.vy = 0;
  b.on = true;
  b.down = false;
  b.fallenUntil = 0;
  b.prevRel = Number.NaN; // 막 섰다 — 다음 틱에 크로싱 없이 상대각부터 다시 잰다
}

/* ───────────────────────────── 봉의 회전과 스침 ───────────────────────────── */

/**
 * 봉의 회전 — 불규칙하게 바뀐다(disc/sim 의 Spin 과 같은 문법, 2026-09-05 사용자: "빨랐다가 느렸다가 왔다갔다").
 * 목표 각속도를 뽑아 일정한 램프로 그리로 가고, 잠시 유지한 뒤 다시 뽑는다. 방향이 자주 뒤집힌다(50%).
 * 멈춤 목표는 없다 — 거의 멈춘 봉은 스침 판정이 죽어서(SWEEP_MIN_OMEGA) 판이 빈다.
 */
export interface Spin {
  theta: number;
  omega: number;
  target: number;
  /** 램프 크기(rad/s²) — 체공 창을 안 깨는 상한(BAR_RAMP_MAX)까지다 */
  rate: number;
  holdUntil: number;
}

export function makeSpin(now: number, rand: () => number = Math.random): Spin {
  const s: Spin = { theta: 0, omega: 0, target: 0, rate: BAR_RAMP_MIN, holdUntil: 0 };
  retarget(s, now, rand);
  return s;
}

/** 새 목표를 뽑는다. 돌려주는 값은 목표의 변화량(rad/s) — 봇이 「봉이 셈을 바꿨다」로 삼는다 */
export function retarget(s: Spin, now: number, rand: () => number): number {
  const before = s.target;
  const mag = BAR_OMEGA_MIN + rand() * (BAR_OMEGA_MAX - BAR_OMEGA_MIN);
  const sign = s.target === 0 ? (rand() < 0.5 ? -1 : 1) : rand() < 0.5 ? -Math.sign(s.target) : Math.sign(s.target);
  s.target = sign * mag;
  s.rate = BAR_RAMP_MIN + rand() * (BAR_RAMP_MAX - BAR_RAMP_MIN);
  const rampMs = (Math.abs(s.target - s.omega) / s.rate) * 1000;
  s.holdUntil = now + rampMs + 1200 + rand() * 2800;
  return s.target - before;
}

/** 한 틱 — 각속도를 목표로 몰고 각도를 적분한다. 목표가 새로 뽑혔으면 그 변화량을 돌려준다 */
export function stepSpin(s: Spin, now: number, dtSec: number, rand: () => number = Math.random): { changed: number } {
  let changed = 0;
  if (now >= s.holdUntil) changed = retarget(s, now, rand);
  const d = s.target - s.omega;
  const cap = s.rate * dtSec;
  s.omega = Math.abs(d) <= cap ? s.target : s.omega + Math.sign(d) * cap;
  s.theta += s.omega * dtSec;
  // 부동소수 정밀도를 위해 접는다 — 클라는 스냅샷 사이만 외삽하므로 불연속이 문제되지 않는다 (disc/sim 과 같다)
  if (s.theta > Math.PI * 4) s.theta -= Math.PI * 4;
  else if (s.theta < -Math.PI * 4) s.theta += Math.PI * 4;
  return { changed };
}

/** 몸과 봉의 상대각(rad, (−π, π]) — 0 이면 봉이 그 몸 위에 있다. rot(θ) 축 규약(disc/sim)과 같아 봉 끝은 (cos θ, −sin θ) 쪽이다 */
export function relOf(b: { x: number; z: number }, theta: number): number {
  return wrap(Math.atan2(-b.z, b.x) - theta);
}

/** 틱 사이에 rel 이 0 을 지났나 — ±π 접힘은 창(CROSS_WINDOW)으로 거른다 */
export function crossed(prevRel: number, rel: number): boolean {
  if (Number.isNaN(prevRel)) return false;
  if (Math.abs(prevRel) > CROSS_WINDOW || Math.abs(rel) > CROSS_WINDOW) return false;
  return (prevRel > 0 && rel <= 0) || (prevRel < 0 && rel >= 0);
}

/** 봉이 이 상대각에 닿기까지(초) — 회전 방향 쪽으로 잰다. 멈춰 있으면 ∞ */
export function timeToCross(rel: number, omega: number): number {
  if (Math.abs(omega) < 0.05) return Number.POSITIVE_INFINITY;
  // d(rel)/dt = −ω — ω > 0 이면 rel 이 줄며 0 으로 온다
  const ahead = omega > 0 ? rel : -rel;
  const d = ahead >= 0 ? ahead : ahead + Math.PI * 2;
  return d / Math.abs(omega);
}

export function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
