/**
 * 폭발 충격파 피하기의 물리 — 순수 함수. 공유 모양(mp/blast.ts: 배치 · 가림 · 감쇠)에 **숨은 세기**(condition.ts BLAST_YIELD)를 곱하는 곳이 여기다.
 *
 *   폭약   놓이면(armAt) BLAST_FUSE_MS 뒤에 터진다. 터진 폭심에서 BLAST_CHAIN_R 안의 다른 폭약은 BLAST_CHAIN_DELAY_MS 뒤에 따라 터진다 — 연쇄.
 *   충격   몸이 얻는 속도 v = Y · BLAST_STRENGTH · falloff(d) × (가려졌으면 COVER_K) × (낮은 자세면 CROUCH_K), 몸무게로 나눈다(J = m·v 에서 v = J/m).
 *          v ≥ BLAST_LAUNCH_V 면 뜬다: 수평은 폭심 반대쪽으로 v·√(1−lift²), 수직은 v·lift (낮은 자세면 lift 가 거의 없어 미끄러지기만 한다).
 *          그 아래면 발이 밀리기만 한다(수평 속도가 붙고 곧 마찰로 선다). 공중의 몸에도 그대로 더해진다 — 연쇄 폭발에 두 번 맞으면 더 멀리.
 *   비행   포물선 — GRAVITY(복도의 점프와 같은 값). 장애물에 부딪히면 그 자리에서 수평 속도를 잃고 떨어진다. 마당 벽도 같다.
 *   착지   쓰러진다 — BLAST_DOWN_BASE_MS + 착지 속도 × BLAST_DOWN_PER_MS 동안 못 움직이고, 남은 수평 속도는 BLAST_SLIDE_DECEL 로 미끄러져 선다.
 *   걷기   서 있을 때만. 낮은 자세면 BLAST_CROUCH_SPEED 로 느리다. 장애물 · 마당 밖으로는 못 간다 (pushOut).
 *
 * 몸무게(mp/bodies.ts mass 1.8): 같은 충격량에 속도가 1/1.8 — 이 판에서는 비만 군인이 덜 날아간다. 그 대신 달리기가 느려 숨을 곳에 늦게 닿는다.
 */
import { GRAVITY } from '../../../../src/world/mp/constants';
import {
  BLAST_BODY_R,
  BLAST_COVER_K,
  BLAST_CROUCH_K,
  BLAST_CROUCH_LIFT,
  BLAST_CROUCH_SPEED,
  BLAST_CROUCH_Y,
  BLAST_DOWN_BASE_MS,
  BLAST_DOWN_PER_MS,
  BLAST_LAUNCH_V,
  BLAST_LIFT,
  BLAST_RUN_SPEED,
  BLAST_SLIDE_DECEL,
  BLAST_STAND_Y,
  BLAST_STRENGTH,
  falloff,
  insideCover,
  isShielded,
  pushOut,
} from '../../../../src/world/mp/blast';
import { BLAST_YIELD } from '../condition';

export function yieldForPhase(phase: number): number {
  return BLAST_YIELD[phase - 1] ?? BLAST_YIELD[0];
}

export type Stance = 'stand' | 'air' | 'down';

export interface BlastBody {
  id: string;
  x: number;
  z: number;
  /** 발 높이 — 공중이면 > 0 */
  y: number;
  vx: number;
  vz: number;
  vy: number;
  /** 몸무게 배율 — 기준 1 */
  mass: number;
  stance: Stance;
  /** 쓰러진 몸이 다시 서는 시각 */
  upAt: number;
  crouch: boolean;
  /** 걷기 명령(월드, m/s) */
  wx: number;
  wz: number;
  running: boolean;
  wAt: number;
  /** 이번 비행의 출발 자리 · 폭심 — 비행 거리 기록용 */
  flightFrom: { x: number; z: number } | null;
  launches: number;
}

export function makeBody(id: string, x: number, z: number, mass = 1): BlastBody {
  return { id, x, z, y: 0, vx: 0, vz: 0, vy: 0, mass, stance: 'stand', upAt: 0, crouch: false, wx: 0, wz: 0, running: false, wAt: 0, flightFrom: null, launches: 0 };
}

export function clampWalk(x: number, z: number, cap = BLAST_RUN_SPEED): { x: number; z: number } {
  const len = Math.hypot(x, z);
  if (!Number.isFinite(len) || len < 1e-6) return { x: 0, z: 0 };
  const k = len > cap ? cap / len : 1;
  return { x: x * k, z: z * k };
}

export interface Charge {
  id: number;
  x: number;
  z: number;
  armAt: number;
  boomAt: number;
}

export interface Boom {
  id: number;
  x: number;
  z: number;
  at: number;
}

export interface HitOut {
  /** 얻은 속도(m/s) — 0 이면 범위 밖 */
  v: number;
  launched: boolean;
  shielded: boolean;
}

/**
 * 폭발 하나가 몸 하나에 준 것. 속도를 더하고, 문턱을 넘으면 띄운다.
 * @param yieldK 이 구간의 숨은 세기 배율
 */
export function applyBlast(b: BlastBody, cx: number, cz: number, yieldK: number): HitOut {
  const dx = b.x - cx;
  const dz = b.z - cz;
  const d = Math.hypot(dx, dz, b.y * 0.5);
  let k = falloff(d);
  if (k <= 0) return { v: 0, launched: false, shielded: false };
  const shielded = b.stance !== 'air' && isShielded(cx, cz, b.x, b.z, b.crouch ? BLAST_CROUCH_Y : BLAST_STAND_Y);
  if (shielded) k *= BLAST_COVER_K;
  const crouched = b.crouch && b.stance === 'stand';
  if (crouched) k *= BLAST_CROUCH_K;
  const v = (yieldK * BLAST_STRENGTH * k) / b.mass;
  if (v < 0.05) return { v: 0, launched: false, shielded };

  // 방향 — 폭심 반대쪽. 폭심 바로 위면 아무 쪽
  const len = Math.hypot(dx, dz);
  const ux = len > 1e-6 ? dx / len : 1;
  const uz = len > 1e-6 ? dz / len : 0;
  const lift = crouched ? BLAST_CROUCH_LIFT : BLAST_LIFT;
  const launched = v >= BLAST_LAUNCH_V;
  if (launched) {
    const horiz = v * Math.sqrt(1 - lift * lift);
    b.vx += ux * horiz;
    b.vz += uz * horiz;
    b.vy += v * lift;
    if (b.stance !== 'air') {
      b.stance = 'air';
      b.flightFrom = { x: b.x, z: b.z };
      b.launches += 1;
      if (b.y <= 0) b.y = 0.01;
    }
  } else if (b.stance === 'stand') {
    // 밀리기만 — 발이 미끄러진다
    b.vx += ux * v;
    b.vz += uz * v;
  }
  return { v, launched, shielded };
}

export interface StepOut {
  /** 이번 틱에 걸은 거리(m) */
  walked: number;
  /** 이번 틱에 착지했다 — 비행 거리(m) */
  landed: number | null;
  /** 이번 틱에 장애물 · 벽에 부딪혔다 */
  slammed: boolean;
}

/** 한 틱 — 자세에 따라 걷기 · 포물선 · 미끄러짐을 적분한다 */
export function stepBody(b: BlastBody, wx: number, wz: number, dtSec: number, now: number): StepOut {
  let walked = 0;
  let landed: number | null = null;
  let slammed = false;

  if (b.stance === 'air') {
    b.vy -= GRAVITY * dtSec;
    const nx = b.x + b.vx * dtSec;
    const nz = b.z + b.vz * dtSec;
    b.y += b.vy * dtSec;
    // 장애물 — 몸 높이가 장애물보다 낮으면 부딪힌다. 마당 벽도
    const hit = insideCover(nx, nz, BLAST_BODY_R);
    if ((hit && b.y < hit.h) || outOfArena(nx, nz)) {
      slammed = true;
      b.vx *= -0.1;
      b.vz *= -0.1;
    } else {
      b.x = nx;
      b.z = nz;
    }
    if (b.y <= 0) {
      b.y = 0;
      const speed = Math.hypot(b.vx, b.vz, b.vy);
      b.vy = 0;
      b.stance = 'down';
      b.upAt = now + BLAST_DOWN_BASE_MS + speed * BLAST_DOWN_PER_MS;
      landed = b.flightFrom ? Math.hypot(b.x - b.flightFrom.x, b.z - b.flightFrom.z) : 0;
      b.flightFrom = null;
    }
    return { walked, landed, slammed };
  }

  // 바닥 — 남은 수평 속도는 마찰로 선다
  const sp = Math.hypot(b.vx, b.vz);
  if (sp > 1e-6) {
    const k = Math.max(0, sp - BLAST_SLIDE_DECEL * dtSec) / sp;
    b.vx *= k;
    b.vz *= k;
  }
  if (b.stance === 'down') {
    if (now >= b.upAt && sp < 0.3) b.stance = 'stand';
  }
  let mx = b.vx;
  let mz = b.vz;
  if (b.stance === 'stand') {
    const cap = b.crouch ? BLAST_CROUCH_SPEED : BLAST_RUN_SPEED;
    const w = clampWalk(wx, wz, cap);
    mx += w.x;
    mz += w.z;
    walked = Math.hypot(w.x, w.z) * dtSec;
  }
  const p = { x: b.x + mx * dtSec, z: b.z + mz * dtSec };
  pushOut(p);
  b.x = p.x;
  b.z = p.z;
  return { walked, landed, slammed };
}

function outOfArena(x: number, z: number): boolean {
  const p = { x, z };
  pushOut(p);
  return Math.abs(p.x - x) > 1e-6 || Math.abs(p.z - z) > 1e-6;
}
