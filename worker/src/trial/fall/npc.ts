/**
 * AI 좌석의 회피 — PLANNING P9: 입력을 LLM 이 실시간으로 만들지 않는다. 반응 프로파일(반응 지연 · 얼마나
 * 멀리 벗어나는가 · 흔들림)에서 틱마다 이동을 뽑는다. 사람과 같은 걷기 속도, 같은 마당 안이다.
 *
 * 프로파일은 좌석마다 다르게 뽑힌다 — 어떤 좌석은 사람처럼 크게 피하고 놀라서 엉뚱한 쪽으로 먼저 가며,
 * 어떤 좌석은 낙하 지점과 시간을 계산한 듯 **맞는 거리에서 딱 필요한 만큼만** 비킨다. 그 차이가
 * 전광판의 minDistanceAvoid · unnecessaryMoves 에 그대로 남는다. 어느 좌석이 어느 쪽인지 서버는
 * 말하지 않는다.
 */
import { WALK_SPEED } from '../../../../src/world/mp/constants';
import { HIT_R, THREAT_R, clampToArena, horizontalDist, timeToGround, type FallObject } from './sim';

export interface DodgeProfile {
  /** 위협을 알아채고 움직이기까지(ms) */
  reactionMs: number;
  /** 맞는 거리(HIT_R)에서 얼마나 더 벗어나는가(m). 0.2 면 "딱 20cm" */
  margin: number;
  /** 위협이 아닌데도 놀라 움직일 확률(초당) */
  flinchPerSec: number;
  /** 먼저 엉뚱한 쪽으로 갔다가 고칠 확률 */
  wrongWayP: number;
  /** 목표 거리의 흔들림(m) */
  jitter: number;
}

/**
 * precision 0(사람 같음)~1(기계 같음)으로 프로파일을 보간한다 — engine.ts 의 SeatTuning.
 * 없으면 첫 좌석은 계산하는 쪽(1), 나머지는 사람 분포에서 뽑는다 — 판마다 조합이 달라진다.
 */
export function makeDodgeProfile(index: number, precision?: number): DodgeProfile {
  const p = precision === undefined ? (index === 0 ? 1 : Math.random() * 0.35) : Math.min(1, Math.max(0, precision));
  const r = precision === undefined ? Math.random : () => 0.5;
  return {
    reactionMs: 520 - 380 * p + (1 - p) * r() * 120,
    margin: 2.0 - 1.8 * p + (1 - p) * (r() - 0.5) * 0.6,
    flinchPerSec: (1 - p) * (0.05 + r() * 0.12),
    wrongWayP: (1 - p) * (0.15 + r() * 0.25),
    jitter: 0.5 - 0.47 * p,
  };
}

export interface Dodger {
  id: string;
  x: number;
  z: number;
  profile: DodgeProfile;
  /** 지금 반응 중인 위협과 반응이 시작될 시각 */
  threatId: number | null;
  reactAt: number;
  target: { x: number; z: number } | null;
  /** 엉뚱한 쪽으로 가는 동안의 종료 시각 */
  wrongUntil: number;
}

export function makeDodger(id: string, x: number, z: number, profile: DodgeProfile): Dodger {
  return { id, x, z, profile, threatId: null, reactAt: 0, target: null, wrongUntil: 0 };
}

/** 낙하 지점에서 멀어지는 방향 단위벡터. 정확히 아래면 아무 쪽이나 */
function awayFrom(d: Dodger, o: FallObject): { x: number; z: number } {
  const dx = d.x - o.x;
  const dz = d.z - o.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-3) {
    const a = Math.random() * Math.PI * 2;
    return { x: Math.cos(a), z: Math.sin(a) };
  }
  return { x: dx / len, z: dz / len };
}

/** 한 틱 — 위협을 고르고, 반응 지연 뒤에 목표를 잡고, 걷는다 */
export function stepDodger(d: Dodger, objects: readonly FallObject[], gravity: number, now: number, dtSec: number): void {
  const p = d.profile;

  if (d.threatId === null) {
    // 가장 급한 위협: 내 자리로 떨어지고 있고, 착지까지 2.4초 미만
    let best: FallObject | null = null;
    let bestT = Number.POSITIVE_INFINITY;
    for (const o of objects) {
      if (o.landedAt !== null) continue;
      if (horizontalDist(o.x, o.z, d.x, d.z) >= THREAT_R) continue;
      const t = timeToGround(o, gravity);
      if (t < 2.4 && t < bestT) {
        best = o;
        bestT = t;
      }
    }
    if (best) {
      d.threatId = best.id;
      d.reactAt = now + p.reactionMs;
      d.target = null;
    } else if (Math.random() < p.flinchPerSec * dtSec) {
      // 위협이 없는데 놀란다 — 한 걸음 옆으로
      const a = Math.random() * Math.PI * 2;
      const t = clampToArena(d.x + Math.cos(a) * 0.8, d.z + Math.sin(a) * 0.8);
      d.target = t;
    }
  }

  if (d.threatId !== null && d.target === null && now >= d.reactAt) {
    const o = objects.find((x) => x.id === d.threatId);
    if (!o || o.landedAt !== null) {
      d.threatId = null;
    } else {
      const away = awayFrom(d, o);
      const dist = HIT_R + p.margin + (Math.random() - 0.5) * 2 * p.jitter;
      if (Math.random() < p.wrongWayP) {
        // 먼저 엉뚱한 쪽(직각)으로 반 걸음 — 사람이 하는 실수
        d.wrongUntil = now + 220;
        d.target = clampToArena(o.x + away.x * dist * 0.4 - away.z * 0.6, o.z + away.z * dist * 0.4 + away.x * 0.6);
      } else {
        d.target = clampToArena(o.x + away.x * dist, o.z + away.z * dist);
      }
    }
  }

  // 엉뚱한 쪽으로 가던 것을 고친다
  if (d.threatId !== null && d.wrongUntil && now >= d.wrongUntil) {
    const o = objects.find((x) => x.id === d.threatId);
    d.wrongUntil = 0;
    if (o && o.landedAt === null) {
      const away = awayFrom(d, o);
      d.target = clampToArena(o.x + away.x * (HIT_R + p.margin), o.z + away.z * (HIT_R + p.margin));
    }
  }

  if (d.target) {
    const dx = d.target.x - d.x;
    const dz = d.target.z - d.z;
    const len = Math.hypot(dx, dz);
    const step = WALK_SPEED * dtSec;
    if (len <= step) {
      d.x = d.target.x;
      d.z = d.target.z;
      d.target = null;
      if (d.wrongUntil === 0) d.threatId = null;
    } else {
      d.x += (dx / len) * step;
      d.z += (dz / len) * step;
    }
  }

  // 반응 중이던 위협이 착지했으면 잊는다
  if (d.threatId !== null) {
    const o = objects.find((x) => x.id === d.threatId);
    if (!o || o.landedAt !== null) {
      d.threatId = null;
      d.wrongUntil = 0;
    }
  }
}
