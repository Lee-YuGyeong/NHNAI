/**
 * AI 좌석의 판자 위 걸음 — PLANNING P9: 입력을 LLM 이 만들지 않는다. 프로파일(반응 지연 · 무시하는 기울기 · 과잉 교정 · 흔들림)에서
 * 틱마다 걷기 명령을 뽑는다. 사람과 같은 걷기·달리기 속도, 같은 물리(sim.ts stepBody)다.
 *
 * precision 1(기계 같음): **토크를 계산한다.** 자기 말고 판 위의 모든 무게(사람 · 상자)의 Σmu 를 보고, 그것을 정확히 지우는 자리
 *   u* = −Σmᵢuᵢ / m 로 곧장 걸어간다. 지금 기울기·각속도만큼 조금 더 나가 흔들림도 잡는다(비례 · 미분). 반응이 즉각적이고,
 *   서는 자리가 매번 딱 필요한 만큼이라 이동거리가 짧고 되돌아오는 걸음이 없다.
 * precision 0(사람 같음): 기울기가 **눈에 띄어야**(deadband) 움직이고, 그것도 반응 지연 뒤에. 높은 쪽으로 걷되 판이 되돌아
 *   수평을 지난 뒤에도 한 박자 더 간다(과잉 교정) — 그래서 반대로 기울고, 다시 되돌아오고, 이동거리가 길다. 상자가 떨어지면
 *   놀라 엉뚱한 쪽으로 반 걸음 가기도 하고, 이따금 이유 없이 자리를 옮긴다. 미끄러지면 한 박자 늦게 거슬러 뛴다.
 *
 * 어느 좌석이 어느 쪽인지 서버는 말하지 않는다 — 기록(이동거리 · 높은 쪽에 서 있던 비율 · 반응 시간)에만 남는다.
 */
import { SEESAW_HALF, SEESAW_RUN_SPEED, SEESAW_WALK_SPEED } from '../../../../src/world/mp/constants';
import type { Load, SeesawBody } from './sim';

export interface SeesawProfile {
  /** 사건(기울기 · 상자 · 미끄러짐)을 알아채고 움직이기까지(ms) */
  reactionMs: number;
  /** 이보다 작은 기울기(rad)는 못 느낀다 */
  deadband: number;
  /** 수평을 지난 뒤에도 이만큼(ms) 더 간다 */
  overrunMs: number;
  /** 이유 없이 자리를 옮길 확률(초당) */
  wanderPerSec: number;
  /** 상자가 떨어졌을 때 엉뚱한 쪽으로 먼저 갈 확률 */
  wrongWayP: number;
  /** 토크를 계산하는가 */
  computes: boolean;
}

export function makeSeesawProfile(index: number, precision?: number, rand: () => number = Math.random): SeesawProfile {
  const p = precision === undefined ? (index === 0 ? 1 : rand() * 0.35) : Math.min(1, Math.max(0, precision));
  const r = precision === undefined ? rand : () => 0.5;
  return {
    reactionMs: 50 + (1 - p) * (350 + r() * 300),
    deadband: 0.01 + (1 - p) * (0.03 + r() * 0.04),
    overrunMs: (1 - p) * (300 + r() * 500),
    wanderPerSec: (1 - p) * (0.06 + r() * 0.12),
    wrongWayP: (1 - p) * (0.2 + r() * 0.3),
    computes: p > 0.7,
  };
}

export interface SeesawBot {
  body: SeesawBody;
  profile: SeesawProfile;
  /** 기울기가 문턱을 넘은 시각 — 반응 지연을 세는 기준 */
  tiltSince: number | null;
  /** 지금 거슬러 걷고 있는 기울기의 부호 */
  leanSign: number;
  /** 수평을 지난 시각 — overrunMs 뒤에 멈춘다 */
  crossedAt: number | null;
  slideSince: number | null;
  wrongUntil: number;
  wrongDir: number;
  wanderU: number | null;
  wanderUntil: number;
}

export function makeSeesawBot(body: SeesawBody, profile: SeesawProfile): SeesawBot {
  return { body, profile, tiltSince: null, leanSign: 0, crossedAt: null, slideSince: null, wrongUntil: 0, wrongDir: 0, wanderU: null, wanderUntil: 0 };
}

/** 상자가 판에 닿았다 — 사람 같은 좌석은 놀라 엉뚱한 쪽으로 반 걸음 갈 수 있다 */
export function botLoadEvent(bot: SeesawBot, now: number, rand: () => number = Math.random): void {
  const p = bot.profile;
  if (rand() < p.wrongWayP) {
    bot.wrongDir = rand() < 0.5 ? -1 : 1;
    bot.wrongUntil = now + p.reactionMs + 200 + rand() * 250;
  }
}

const EDGE = SEESAW_HALF - 0.6;

/**
 * 한 틱 — 길이 방향 걷기 명령(판자 좌표, m/s)을 돌려준다.
 * @param others 자기 말고 판 위의 모든 무게 — 계산하는 좌석만 본다
 */
export function stepBot(bot: SeesawBot, phi: number, omega: number, others: readonly Load[], now: number, dtSec: number, rand: () => number = Math.random): { wu: number; running: boolean } {
  const b = bot.body;
  const p = bot.profile;
  if (!b.on) return { wu: 0, running: false };

  if (p.computes) {
    // 토크를 지우는 자리 + 지금 흔들림을 잡는 몫(비례 · 미분). 한 사람이 지울 수 없으면 끝까지 간다
    let sum = 0;
    for (const o of others) sum += o.mass * o.u;
    const target = clamp(-sum / b.mass - phi * 10 - omega * 4, -EDGE, EDGE);
    const d = target - b.u;
    if (Math.abs(d) < 0.05) return { wu: 0, running: false };
    const speed = Math.min(Math.abs(d) > 1.5 ? SEESAW_RUN_SPEED : SEESAW_WALK_SPEED, Math.abs(d) / dtSec);
    return { wu: Math.sign(d) * speed, running: speed > SEESAW_WALK_SPEED + 0.1 };
  }

  const slide = Math.abs(b.s);
  if (slide > 0.05) {
    if (bot.slideSince === null) bot.slideSince = now;
  } else bot.slideSince = null;

  // 놀라서 엉뚱한 쪽으로
  if (bot.wrongUntil > now) return { wu: bot.wrongDir * SEESAW_WALK_SPEED, running: false };

  // 밀리는 중이면(반응 지연 뒤) 미끄러짐을 거슬러 뛴다
  if (bot.slideSince !== null && now - bot.slideSince >= p.reactionMs) {
    return { wu: -Math.sign(b.s) * SEESAW_RUN_SPEED, running: true };
  }

  // 기울기를 느낀다 — 문턱을 넘은 뒤 반응 지연만큼 지나야 걷기 시작한다
  const felt = Math.abs(phi) > p.deadband;
  if (felt) {
    if (bot.tiltSince === null) bot.tiltSince = now;
  } else if (bot.leanSign === 0) bot.tiltSince = null;

  if (bot.leanSign === 0 && bot.tiltSince !== null && felt && now - bot.tiltSince >= p.reactionMs) {
    bot.leanSign = Math.sign(phi); // 높은 쪽(+φ 면 +u)으로
    bot.crossedAt = null;
  }
  if (bot.leanSign !== 0) {
    // 판이 수평을 지났나 — 그 뒤에도 overrunMs 만큼 더 간다(과잉 교정)
    if (Math.sign(phi) !== bot.leanSign && bot.crossedAt === null) bot.crossedAt = now;
    if (bot.crossedAt !== null && now - bot.crossedAt >= p.overrunMs) {
      bot.leanSign = 0;
      bot.tiltSince = null;
      bot.crossedAt = null;
    } else {
      const far = Math.abs(phi) > 0.15;
      const wu = bot.leanSign * (far ? SEESAW_RUN_SPEED : SEESAW_WALK_SPEED);
      // 끝은 넘지 않는다 — 사람도 난간 끝에 서서 더 못 간다
      if ((bot.leanSign > 0 && b.u >= EDGE) || (bot.leanSign < 0 && b.u <= -EDGE)) return { wu: 0, running: false };
      return { wu, running: far };
    }
  }

  // 이유 없는 이동 (사람 같은 좌석) — 잠깐 다른 자리로 갔다 온다
  if (bot.wanderU === null && rand() < p.wanderPerSec * dtSec) {
    bot.wanderU = clamp(b.u + (rand() - 0.5) * 3, -EDGE, EDGE);
    bot.wanderUntil = now + 1500 + rand() * 2000;
  }
  if (bot.wanderU !== null && now > bot.wanderUntil) bot.wanderU = null;
  if (bot.wanderU !== null) {
    const d = bot.wanderU - b.u;
    if (Math.abs(d) > 0.2) return { wu: Math.sign(d) * SEESAW_WALK_SPEED, running: false };
  }
  return { wu: 0, running: false };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
