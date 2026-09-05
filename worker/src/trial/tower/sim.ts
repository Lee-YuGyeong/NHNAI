/**
 * 무너지는 타워 생존의 물리 — 순수 함수. 공유 격자(mp/tower.ts)에 **숨은 마찰**(condition.ts TOWER_GRIP)을 곱하는 곳이 여기다.
 *
 *   발판   기울기 벡터 t(낮은 쪽, tan). I·ẗ = g·Σ mᵢdᵢ − c·ṫ − k·t. |t| 가 TOWER_TILT_BREAK 를 넘으면 떨어진다 — 그 위의 몸도 같이.
 *   몸     서 있는 발판의 기울기 t 위에서: 경사 가속 g·t(낮은 쪽), 마찰 예산 μg. |t| ≤ μ 면 발이 잡고, 넘으면 낮은 쪽으로 미끄러진다.
 *          이미 미끄러지는 중(밀린 것 포함)이면 운동 마찰 μg 가 **바닥 대비 실제 속도(걷기 + s)**의 반대로 걸린다 — 회전 원판 · 다리와 같은 규칙.
 *          자리를 적분한 뒤 발밑에 발판이 없으면(떨어진 발판 · 격자 밖) 그 순간 떨어진다 — 그 뒤는 포물선(GRAVITY), 바닥(0)에 닿으면 눕는다.
 *   밀치기 앞 TOWER_PUSH_R 안, 내적 TOWER_PUSH_ARC 넘는 몸 가운데 가장 가까운 것. 그 몸의 s 에 방향 × TOWER_PUSH_V × (내 질량 / 그 질량).
 *   충돌   겹친 몸끼리 질량 반비례로 밀어낸다.
 */
import { GRAVITY } from '../../../../src/world/mp/constants';
import {
  TOWER_BODY_R,
  TOWER_DAMPING,
  TOWER_N,
  TOWER_PUSH_ARC,
  TOWER_PUSH_R,
  TOWER_PUSH_RECOIL,
  TOWER_PUSH_V,
  TOWER_RESPAWN_MS,
  TOWER_RUN_SPEED,
  TOWER_SLAB_INERTIA,
  TOWER_SPRING,
  TOWER_TILT_BREAK,
  slabCenter,
  slabIndexAt,
  slabSurfaceY,
  type SlabState,
} from '../../../../src/world/mp/tower';
import { TOWER_GRIP } from '../condition';

export const G = 9.8;
export const SLIDE_ON = 0.15;
export const SLIDE_OFF = 0.05;

export function gripForPhase(phase: number): number {
  return TOWER_GRIP[phase - 1] ?? TOWER_GRIP[0];
}

/* ───────────────────────────── 발판 ───────────────────────────── */

export interface Slab {
  idx: number;
  /** 기울기 벡터(낮은 쪽, tan)와 그 변화율 */
  tx: number;
  tz: number;
  vx: number;
  vz: number;
  state: SlabState;
  /** 상태가 바뀐 시각 — 경고면 떨어질 시각을 여기서 센다 */
  at: number;
  /** 마모(0~1) — 서 있는 무게 × 시간. 1 이면 경고 */
  wear: number;
}

export function makeSlabs(): Slab[] {
  return Array.from({ length: TOWER_N * TOWER_N }, (_, idx) => ({ idx, tx: 0, tz: 0, vx: 0, vz: 0, state: 0 as SlabState, at: 0, wear: 0 }));
}

/** 발판 위의 무게 하나 — 발판 중심에서의 자리와 질량 */
export interface SlabLoad {
  dx: number;
  dz: number;
  mass: number;
}

/**
 * 한 틱 — 토크 · 감쇠 · 스프링으로 기울기를 적분하고, 서 있는 무게만큼 닳는다. 부서지면 true.
 * @param wearPerKgSec 질량 1kg 이 1초 서 있을 때 차는 마모 — 기준 몸이 TOWER_WEAR_S 초면 1 이 되게 엔진이 준다. 0 이면 안 닳는다
 */
export function stepSlab(s: Slab, loads: readonly SlabLoad[], dtSec: number, wearPerKgSec = 0): boolean {
  if (s.state >= 2) return false;
  let mx = 0;
  let mz = 0;
  for (const l of loads) {
    mx += l.mass * l.dx;
    mz += l.mass * l.dz;
    if (s.state === 0) s.wear = Math.min(1, s.wear + l.mass * wearPerKgSec * dtSec);
  }
  const ax = (G * mx - TOWER_DAMPING * s.vx - TOWER_SPRING * s.tx) / TOWER_SLAB_INERTIA;
  const az = (G * mz - TOWER_DAMPING * s.vz - TOWER_SPRING * s.tz) / TOWER_SLAB_INERTIA;
  s.vx += ax * dtSec;
  s.vz += az * dtSec;
  s.tx += s.vx * dtSec;
  s.tz += s.vz * dtSec;
  return Math.hypot(s.tx, s.tz) > TOWER_TILT_BREAK;
}

/* ───────────────────────────── 몸 ───────────────────────────── */

export type Stance = 'stand' | 'air' | 'down';

export interface TowerBody {
  id: string;
  x: number;
  z: number;
  y: number;
  /** 미끄러짐 · 밀림 속도(m/s) — 발판 위에서 마찰로 줄어든다 */
  sx: number;
  sz: number;
  /** 공중 속도 */
  vx: number;
  vz: number;
  vy: number;
  mass: number;
  stance: Stance;
  /** 서 있는 발판 번호 — 공중이면 −1 */
  slab: number;
  upAt: number;
  wx: number;
  wz: number;
  running: boolean;
  wAt: number;
  heading: number;
  pushAt: number;
  falls: number;
}

export function makeBody(id: string, x: number, z: number, mass = 1): TowerBody {
  return {
    id,
    x,
    z,
    y: 0,
    sx: 0,
    sz: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    mass,
    stance: 'stand',
    slab: slabIndexAt(x, z),
    upAt: 0,
    wx: 0,
    wz: 0,
    running: false,
    wAt: 0,
    heading: 0,
    pushAt: 0,
    falls: 0,
  };
}

export function clampWalk(x: number, z: number, cap = TOWER_RUN_SPEED): { x: number; z: number } {
  const len = Math.hypot(x, z);
  if (!Number.isFinite(len) || len < 1e-6) return { x: 0, z: 0 };
  const k = len > cap ? cap / len : 1;
  return { x: x * k, z: z * k };
}

/** 몸이 설 수 있는 발판인가 — 성함 · 경고(아직 붙어 있다) */
export function standable(slabs: readonly Slab[], idx: number): boolean {
  return idx >= 0 && idx < slabs.length && slabs[idx].state <= 1;
}

export interface StepOut {
  walked: number;
  /** 이번 틱에 지지를 잃고 떨어지기 시작했다 */
  fell: boolean;
  /** 이번 틱에 바닥에 닿았다 */
  landed: boolean;
  /** 이번 틱에 필요했던 마찰(m/s²) · 실제 미끄러진 속도(m/s) */
  need: number;
  slide: number;
}

/**
 * 한 틱. 서 있으면 발판 기울기 위에서 걷기 · 미끄러짐 · 밀림을 적분하고, 발밑에 발판이 없어지면 떨어진다.
 * @param mu 이 구간의 숨은 마찰 × 몸 배율
 */
export function stepBody(b: TowerBody, slabs: readonly Slab[], wx: number, wz: number, mu: number, dtSec: number, now: number): StepOut {
  const out: StepOut = { walked: 0, fell: false, landed: false, need: 0, slide: 0 };

  if (b.stance === 'air') {
    b.vy -= GRAVITY * dtSec;
    b.x += b.vx * dtSec;
    b.z += b.vz * dtSec;
    b.y += b.vy * dtSec;
    if (b.y <= 0) {
      b.y = 0;
      b.vx = 0;
      b.vz = 0;
      b.vy = 0;
      b.stance = 'down';
      b.upAt = now + TOWER_RESPAWN_MS;
      out.landed = true;
    }
    return out;
  }
  if (b.stance === 'down') return out;

  // 서 있다 — 발밑 발판의 기울기
  const s = slabs[b.slab];
  const tx = s ? s.tx : 0;
  const tz = s ? s.tz : 0;
  const gSx = G * tx;
  const gSz = G * tz;
  const need = Math.hypot(gSx, gSz);
  const grip = mu * G;
  out.need = need;
  const slide = Math.hypot(b.sx, b.sz);
  if (slide < SLIDE_OFF) {
    if (need > grip) {
      const k = (need - grip) / need;
      b.sx += gSx * k * dtSec;
      b.sz += gSz * k * dtSec;
    } else {
      b.sx = 0;
      b.sz = 0;
    }
  } else {
    // 미끄러지는 · 밀린 중 — 운동 마찰은 바닥 대비 실제 속도 u = w + s 의 반대로
    const ux = wx + b.sx;
    const uz = wz + b.sz;
    const su = Math.hypot(ux, uz);
    const ex = su > 1e-6 ? ux / su : 0;
    const ez = su > 1e-6 ? uz / su : 0;
    const nsx = b.sx + (gSx - grip * ex) * dtSec;
    const nsz = b.sz + (gSz - grip * ez) * dtSec;
    if ((nsx + wx) * ux + (nsz + wz) * uz < 0) {
      b.sx = -wx;
      b.sz = -wz;
    } else {
      b.sx = nsx;
      b.sz = nsz;
    }
  }
  out.slide = Math.hypot(b.sx, b.sz);
  out.walked = Math.hypot(wx, wz) * dtSec;
  b.x += (wx + b.sx) * dtSec;
  b.z += (wz + b.sz) * dtSec;

  // 발밑 — 발판이 있으면 그 윗면, 없으면 떨어진다
  const idx = slabIndexAt(b.x, b.z);
  if (!standable(slabs, idx)) {
    out.fell = true;
    fall(b, wx + b.sx, wz + b.sz);
    return out;
  }
  b.slab = idx;
  b.y = slabSurfaceY(idx, slabs[idx].tx, slabs[idx].tz, b.x, b.z, slabs[idx].wear);
  return out;
}

/** 지지를 잃었다 — 그 속도로 날아 떨어진다 */
export function fall(b: TowerBody, vx: number, vz: number): void {
  b.stance = 'air';
  b.slab = -1;
  b.vx = vx;
  b.vz = vz;
  b.vy = 0;
  b.sx = 0;
  b.sz = 0;
  b.falls += 1;
}

/** 다시 선다 — 주어진 발판 가운데 */
export function respawn(b: TowerBody, slabs: readonly Slab[], idx: number, dx = 0, dz = 0): void {
  const c = slabCenter(idx);
  b.x = c.x + dx;
  b.z = c.z + dz;
  b.slab = idx;
  b.stance = 'stand';
  b.sx = 0;
  b.sz = 0;
  b.vx = 0;
  b.vz = 0;
  b.vy = 0;
  b.y = slabSurfaceY(idx, slabs[idx].tx, slabs[idx].tz, b.x, b.z, slabs[idx].wear);
}

/** 몸끼리 겹치면 질량 반비례로 밀어낸다 — 서 있는 몸끼리만 */
export function separate(bodies: readonly TowerBody[]): void {
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      if (a.stance !== 'stand' || b.stance !== 'stand') continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = TOWER_BODY_R * 2;
      if (d >= min || d < 1e-6) continue;
      const push = (min - d) / (a.mass + b.mass);
      const nx = dx / d;
      const nz = dz / d;
      a.x -= nx * push * b.mass;
      a.z -= nz * push * b.mass;
      b.x += nx * push * a.mass;
      b.z += nz * push * a.mass;
    }
  }
}

/**
 * 밀친다 — 앞(hx, hz) TOWER_PUSH_R 안, 내적이 문턱을 넘는 서 있는 몸 가운데 가장 가까운 것. 밀린 몸의 s 에 속도를 더하고 나는 조금 물러난다.
 * @returns 밀린 몸 — 없으면 null
 */
export function shove(me: TowerBody, others: readonly TowerBody[], hx: number, hz: number): TowerBody | null {
  const len = Math.hypot(hx, hz);
  if (me.stance !== 'stand' || !Number.isFinite(len) || len < 1e-6) return null;
  const ux = hx / len;
  const uz = hz / len;
  let best: TowerBody | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const o of others) {
    if (o.id === me.id || o.stance !== 'stand') continue;
    const dx = o.x - me.x;
    const dz = o.z - me.z;
    const d = Math.hypot(dx, dz);
    if (d > TOWER_PUSH_R || d < 1e-6) continue;
    if ((dx * ux + dz * uz) / d < TOWER_PUSH_ARC) continue;
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  if (!best) return null;
  const dx = best.x - me.x;
  const dz = best.z - me.z;
  const d = Math.hypot(dx, dz) || 1;
  const v = (TOWER_PUSH_V * me.mass) / best.mass;
  best.sx += (dx / d) * v;
  best.sz += (dz / d) * v;
  me.sx -= (dx / d) * TOWER_PUSH_RECOIL;
  me.sz -= (dz / d) * TOWER_PUSH_RECOIL;
  return best;
}
