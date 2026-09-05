/**
 * AI 좌석의 봉 넘기 — PLANNING P9: 입력을 LLM 이 만들지 않는다. 프로파일(반응 지연 · 타이밍 흔들림 · 버릇)에서
 * 틱마다 걷기 명령과 점프를 뽑는다. 사람과 같은 이륙 속도, 같은 물리(sim.ts stepBarBody), 같은 점프 통로(엔진의 jump)다.
 *
 * precision 1(기계 같음): 봉이 닿기까지의 시간이 체공의 절반과 같아지는 **정확히 그 순간** 뛴다 — 스침이 늘 체공
 *   한가운데다(흔들림 ±20ms). 회전이 뒤집혀도 즉시 새 방향으로 다시 재고, 헛점프가 없다.
 * precision 0(사람 같음): 체공 중심에서 ±0.2초쯤 벗어난 버릇(earlyBias)에 스침마다 흔들림이 얹힌다. 회전이 뒤집히면
 *   한 박자(retimeUntil) 동안 **옛 방향으로 계속 재서** 첫 봉을 놓치기 쉽다 — 사람이 실제로 맞는 그 봉이다.
 *   이따금 이유 없이 뛰고(헛점프), 스침 사이에 어슬렁거린다.
 *
 * 전 좌석 공통 둘 (2026-09-05 사용자: "AI들이 가만히 서서 너무 잘 넘어. 가끔 못하는 모습도 보여야해"):
 *   · **재배치 시계**(moveEveryMs) — 몇 초마다 반드시 새 자리로 걸어간다. 동상처럼 서 있으면 이동거리 0 이 곧 정답표다.
 *     기계 좌석은 봉이 먼 안전한 순간을 골라 걷고, 사람 같은 좌석은 평소 문턱 그대로다.
 *   · **실수**(lapseP) — 스침마다 이 확률로 망친다: 아예 안 뛰거나(딴청) 너무 일찍 뛰어 내려선 자리에 봉을 받는다.
 *     기계 좌석은 드물게(5%), 사람 같은 좌석은 자주(15~30%) — 완벽한 좌석도, 늘 넘어지는 좌석도 정답표이긴 마찬가지다.
 *
 * 어느 좌석이 어느 쪽인지 서버는 말하지 않는다 — 기록(타이밍 오차 · 헛점프 · 이동거리 · 맞음)에만 남는다.
 */
import { BAR_R, BAR_WALK_SPEED } from '../../../../src/world/mp/constants';
import { G, MIN_R, relOf, timeToCross, type BarBody, type Vec2 } from './sim';

export interface BarProfile {
  /** 회전이 바뀐 것을 새 타이밍에 반영하기까지(ms) */
  reactionMs: number;
  /** 스침마다의 도약 시점 흔들림(±ms) */
  jitterMs: number;
  /** 체공 중심 대비 이르게(+) · 늦게(−) 뛰는 버릇(ms) — 기계는 0 */
  earlyBiasMs: number;
  /** 이유 없이 뛸 확률(초당) */
  unnecessaryPerSec: number;
  /** 이유 없이 자리를 옮길 확률(초당) */
  wanderPerSec: number;
  /** 반드시 자리를 옮기는 간격(ms, 평균) — 몇 번은 걷는다 (머리말) */
  moveEveryMs: number;
  /** 스침 하나를 망칠 확률 — 안 뛰거나 너무 일찍 뛴다 (머리말) */
  lapseP: number;
  /** 서 있고 싶은 반지름(m) */
  targetR: number;
  /** 정확히 재는가 — 기계 좌석 */
  computes: boolean;
}

export function makeBarProfile(index: number, precision?: number, rand: () => number = Math.random): BarProfile {
  const p = precision === undefined ? (index === 0 ? 1 : rand() * 0.35) : Math.min(1, Math.max(0, precision));
  const r = precision === undefined ? rand : () => 0.5;
  return {
    reactionMs: 80 + (1 - p) * (500 + r() * 400),
    jitterMs: 20 + (1 - p) * (110 + r() * 150),
    earlyBiasMs: (1 - p) * (r() - 0.5) * 260,
    unnecessaryPerSec: (1 - p) * (0.015 + r() * 0.05),
    wanderPerSec: (1 - p) * (0.06 + r() * 0.12),
    moveEveryMs: 7000 + r() * 5000,
    lapseP: 0.05 + (1 - p) * (0.1 + r() * 0.15),
    // 기계는 바깥 고리(몸의 각폭이 좁아 여유가 큰 자리), 사람은 가운데께 — 가장자리는 밀리면 떨어져서 꺼린다
    targetR: p > 0.7 ? 4.2 : 2.6 + r() * 1.4,
    computes: p > 0.7,
  };
}

export interface BarBot {
  body: BarBody;
  profile: BarProfile;
  /** 타이밍에 쓰는 각속도 — 회전이 바뀌면 retimeUntil 까지 옛 값으로 잰다(그래서 첫 봉을 놓친다) */
  omegaBelief: number;
  retimeUntil: number;
  /** 이번 스침의 흔들림(초) — 뛸 때마다 새로 뽑는다 */
  jitterNow: number;
  wanderTo: Vec2 | null;
  wanderUntil: number;
  /** 다음 강제 재배치 시각 — 0 이면 첫 안전한 순간에 바로 걷는다 */
  nextMoveAt: number;
  /** 다가오는 스침을 망치기로 했나 — 접근마다 한 번 정하고(lapseDecided), 지나가면 다시 정한다 */
  lapse: 'skip' | 'early' | null;
  lapseDecided: boolean;
}

export function makeBarBot(body: BarBody, profile: BarProfile, rand: () => number = Math.random): BarBot {
  return {
    body,
    profile,
    omegaBelief: 0,
    retimeUntil: 0,
    jitterNow: sampleJitter(profile, rand),
    wanderTo: null,
    wanderUntil: 0,
    nextMoveAt: 0,
    lapse: null,
    lapseDecided: false,
  };
}

function sampleJitter(p: BarProfile, rand: () => number): number {
  return ((rand() * 2 - 1) * p.jitterMs) / 1000;
}

/** 봉이 목표 속도를 새로 뽑았다 — 사람 같은 좌석은 한 박자 동안 옛 셈으로 계속 잰다 */
export function botOmegaEvent(bot: BarBot, now: number, rand: () => number = Math.random): void {
  bot.retimeUntil = now + bot.profile.reactionMs * (0.7 + rand() * 0.6);
}

/**
 * 한 틱 — 걷기 명령(월드 좌표)을 돌려주고, 때가 되면 jump 를 부른다(엔진의 통로 — 사람과 같다, P9).
 */
export function stepBarBot(
  bot: BarBot,
  theta: number,
  omega: number,
  now: number,
  dtSec: number,
  rand: () => number,
  doJump: (id: string) => void,
): { w: Vec2; running: boolean } {
  const b = bot.body;
  const p = bot.profile;
  if (!b.on || b.down) return { w: { x: 0, z: 0 }, running: false };

  if (now >= bot.retimeUntil) bot.omegaBelief = omega;

  const rel = relOf(b, theta);
  const tCross = timeToCross(rel, bot.omegaBelief);
  const grounded = b.y <= 0.001 && b.vy <= 0;
  const aim = b.v0 / G + (p.earlyBiasMs / 1000 + bot.jitterNow);

  // 이번 스침을 망칠 것인가 — 봉이 다가올 때 한 번만 정한다. 지나가서 멀어지면 다음 접근에서 다시 (머리말 lapseP)
  if (tCross < 1.5 && !bot.lapseDecided) {
    bot.lapseDecided = true;
    bot.lapse = rand() < p.lapseP ? (rand() < 0.5 ? 'skip' : 'early') : null;
  } else if (tCross > 2.0 && bot.lapseDecided) {
    bot.lapseDecided = false;
    bot.lapse = null;
  }

  // 도약 — 봉이 닿기까지가 「체공의 절반 + 버릇 + 흔들림」 아래로 내려오는 순간.
  // 망치기로 한 스침은: skip 이면 그냥 서서 받고, early 면 반 박자 일찍 뛰어 내려선 자리에 봉을 받는다
  const jumpAt = bot.lapse === 'early' ? aim + 0.3 + rand() * 0.2 : aim;
  if (grounded && bot.lapse !== 'skip' && tCross <= Math.max(0.05, jumpAt)) {
    doJump(b.id);
    bot.jitterNow = sampleJitter(p, rand);
  } else if (grounded && tCross > 2.5 && rand() < p.unnecessaryPerSec * dtSec) {
    // 헛점프 — 봉이 오지도 않는데 뛴다 (사람 같은 좌석만, 확률이 0 이 아니다)
    doJump(b.id);
  }

  // 재배치 시계 — 때가 되면 반드시 새 자리를 뽑는다. 기계 좌석은 봉이 먼 안전한 순간만 고른다
  const safeToStart = tCross > (p.computes ? aim + 0.8 : Math.max(0.6, aim + 0.3));
  if (bot.wanderTo === null && now >= bot.nextMoveAt && safeToStart) {
    const a = rand() * Math.PI * 2;
    const wr = Math.min(BAR_R - 1, Math.max(MIN_R + 0.4, p.targetR + (rand() - 0.5) * 2.4));
    bot.wanderTo = { x: Math.cos(a) * wr, z: Math.sin(a) * wr };
    bot.wanderUntil = now + 2500 + rand() * 2000;
    bot.nextMoveAt = now + p.moveEveryMs * (0.7 + rand() * 0.6);
  }

  // 봉이 코앞이면 서서 기다린다 — 걸으면서 뛰면 공중에서 못 고친다 (sim.ts: 공중에서는 v 가 얼어붙는다)
  if (tCross < Math.max(0.6, aim + 0.3)) return { w: { x: 0, z: 0 }, running: false };

  let wx = 0;
  let wz = 0;

  // 가는 중인 재배치 — 기계도 사람도 같은 길로 걷는다 (기록의 이동거리가 여기서 나온다)
  if (bot.wanderTo !== null) {
    const dx = bot.wanderTo.x - b.x;
    const dz = bot.wanderTo.z - b.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3 || now > bot.wanderUntil) {
      bot.wanderTo = null;
    } else {
      wx = (dx / d) * BAR_WALK_SPEED;
      wz = (dz / d) * BAR_WALK_SPEED;
      return { w: { x: wx, z: wz }, running: false };
    }
  }

  const r = Math.hypot(b.x, b.z);
  if (p.computes) {
    // 기계 — 목표 반지름을 정확히 지킨다
    const dr = r - p.targetR;
    if (Math.abs(dr) > 0.15 && r > 1e-6) {
      const k = Math.min(1, Math.abs(dr) / 0.5);
      const sgn = dr > 0 ? -1 : 1;
      wx = (b.x / r) * sgn * BAR_WALK_SPEED * k;
      wz = (b.z / r) * sgn * BAR_WALK_SPEED * k;
    }
  } else if (rand() < p.wanderPerSec * dtSec) {
    // 사람 같은 좌석 — 시계와 별개로 이따금 어슬렁거린다
    const a = rand() * Math.PI * 2;
    const wr = Math.min(BAR_R - 1, Math.max(MIN_R + 0.4, p.targetR + (rand() - 0.5) * 2.4));
    bot.wanderTo = { x: Math.cos(a) * wr, z: Math.sin(a) * wr };
    bot.wanderUntil = now + 2000 + rand() * 2000;
  }

  return { w: { x: wx, z: wz }, running: false };
}
