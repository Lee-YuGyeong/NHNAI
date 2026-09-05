/**
 * AI 좌석의 폭발 피하기 — PLANNING P9: 입력을 LLM 이 만들지 않는다. 프로파일(반응 지연 · 숨을 곳을 찾는가 · 엉뚱한 방향 · 자세 습관)에서
 * 틱마다 걷기 명령과 자세를 뽑는다. 사람과 같은 속도, 같은 물리(sim.ts)다.
 *
 * precision 1(기계 같음): 폭약이 놓이는 순간 **위험도(mp/blast.ts dangerAt)를 계산**해, 남은 도화선 안에 닿을 수 있는 자리 가운데 가장 안전한
 *   곳(장애물 뒤 그늘)으로 곧장 달린다. 그늘에 닿지 못할 것 같으면 폭심에서 정확히 반대로 달리다 터지기 0.3초 전에 자세를 낮춘다.
 *   세기를 모르니 기준으로 계산하지만, 한 번 날아가면 그 거리에서 얻은 속도로 세기를 추정해(yieldEst) 그 뒤로는 그만큼 멀리 간다.
 * precision 0(사람 같음): 빨간 등이 깜박이는 것을 알아채는 데 반응 지연이 있고, 숨을 곳을 찾지 않고 **폭심 반대로 뛴다**(멀어지면 되는 줄 안다).
 *   가끔 엉뚱한 쪽으로 반 걸음 가고, 자세는 습관대로(늦게 · 아예 안 · 너무 일찍). 연쇄 폭발에는 매번 새로 놀란다.
 *
 * 어느 좌석이 어느 쪽인지 서버는 말하지 않는다 — 기록(비행 거리 · 엄폐 비율 · 반응 시간)에만 남는다.
 */
import { BLAST_COVERS, BLAST_CROUCH_SPEED, BLAST_FALLOFF, BLAST_R, BLAST_RUN_SPEED, BLAST_STRENGTH, BLAST_WALK_SPEED, dangerAt, insideCover } from '../../../../src/world/mp/blast';
import type { BlastBody, Charge } from './sim';

export interface BlastProfile {
  reactionMs: number;
  /** 숨을 곳을 찾는가(그늘 계산) — 아니면 폭심 반대로만 뛴다 */
  computes: boolean;
  /** 엉뚱한 쪽으로 먼저 갈 확률 */
  wrongWayP: number;
  /** 자세 습관 — 터지기 몇 ms 전에 낮추나(음수면 안 낮춘다) */
  crouchLeadMs: number;
  /** 이유 없이 자리를 옮길 확률(초당) */
  wanderPerSec: number;
}

export function makeBlastProfile(index: number, precision?: number, rand: () => number = Math.random): BlastProfile {
  const p = precision === undefined ? (index === 0 ? 1 : rand() * 0.35) : Math.min(1, Math.max(0, precision));
  const r = precision === undefined ? rand : () => 0.5;
  const lateOrNever = r();
  return {
    reactionMs: 60 + (1 - p) * (380 + r() * 320),
    computes: p > 0.7,
    wrongWayP: (1 - p) * (0.2 + r() * 0.3),
    crouchLeadMs: p > 0.7 ? 300 : lateOrNever < 0.35 ? -1 : 80 + r() * 600,
    wanderPerSec: (1 - p) * (0.05 + r() * 0.1),
  };
}

export interface BlastBot {
  body: BlastBody;
  profile: BlastProfile;
  /** 세기 추정 — 기준 1. 날아간 뒤 갱신(computes) */
  yieldEst: number;
  /** 지금 반응하고 있는 폭약과 알아챈 시각 */
  target: Charge | null;
  noticedAt: number;
  wrongUntil: number;
  wrongDir: { x: number; z: number };
  goal: { x: number; z: number } | null;
  wanderGoal: { x: number; z: number } | null;
}

export function makeBlastBot(body: BlastBody, profile: BlastProfile): BlastBot {
  return { body, profile, yieldEst: 1, target: null, noticedAt: 0, wrongUntil: 0, wrongDir: { x: 1, z: 0 }, goal: null, wanderGoal: null };
}

/** 날아갔다 — 계산하는 좌석은 얻은 속도에서 세기를 되짚는다 (v = Y·S·falloff(d)/m) */
export function botLaunched(bot: BlastBot, v: number, d: number): void {
  if (!bot.profile.computes) return;
  const base = (BLAST_STRENGTH / bot.body.mass) * (1 / (1 + (Math.max(0.5, d) / BLAST_FALLOFF) ** 2));
  if (base > 1e-6) bot.yieldEst = Math.min(3, Math.max(0.3, v / base));
}

/** 가장 급한 폭약 — 위험도 × 임박도 */
function mostUrgent(bot: BlastBot, charges: readonly Charge[], now: number): Charge | null {
  const b = bot.body;
  let best: Charge | null = null;
  let score = 0;
  for (const c of charges) {
    const d = Math.hypot(b.x - c.x, b.z - c.z);
    if (d > BLAST_R + 1) continue;
    const s = (BLAST_R + 1 - d) / Math.max(200, c.boomAt - now);
    if (s > score) {
      score = s;
      best = c;
    }
  }
  return best;
}

/** 장애물 그늘의 후보 자리들 — 폭심에서 봤을 때 장애물 뒤 0.7m */
function shadowSpots(cx: number, cz: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const c of BLAST_COVERS) {
    const dx = c.x - cx;
    const dz = c.z - cz;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    const ext = Math.abs(ux) * c.hx + Math.abs(uz) * c.hz + 0.7;
    const p = { x: c.x + ux * ext, z: c.z + uz * ext };
    if (!insideCover(p.x, p.z)) out.push(p);
  }
  return out;
}

export interface BotOut {
  wx: number;
  wz: number;
  running: boolean;
  crouch: boolean;
}

export function stepBot(bot: BlastBot, charges: readonly Charge[], now: number, dtSec: number, rand: () => number = Math.random): BotOut {
  const b = bot.body;
  const p = bot.profile;
  const still: BotOut = { wx: 0, wz: 0, running: false, crouch: false };
  if (b.stance !== 'stand') return still;

  const urgent = mostUrgent(bot, charges, now);
  if (urgent && (bot.target === null || bot.target.id !== urgent.id)) {
    bot.target = urgent;
    bot.noticedAt = now;
    bot.goal = null;
    if (rand() < p.wrongWayP) {
      const a = rand() * Math.PI * 2;
      bot.wrongDir = { x: Math.cos(a), z: Math.sin(a) };
      bot.wrongUntil = now + p.reactionMs + 200 + rand() * 250;
    }
  }
  if (!urgent) bot.target = null;

  if (bot.target && now - bot.noticedAt >= p.reactionMs) {
    const c = bot.target;
    const left = c.boomAt - now;
    if (bot.wrongUntil > now) return { wx: bot.wrongDir.x * BLAST_WALK_SPEED, wz: bot.wrongDir.z * BLAST_WALK_SPEED, running: false, crouch: false };

    if (p.computes) {
      // 닿을 수 있는 자리 가운데 가장 안전한 곳 — 자기 자리(자세 낮춤)도 후보다
      if (!bot.goal) {
        const reach = (BLAST_RUN_SPEED * Math.max(0, left - 150)) / 1000;
        let best = { x: b.x, z: b.z };
        let bestDanger = dangerAt(b.x, b.z, true, c.x, c.z) * bot.yieldEst;
        for (const s of shadowSpots(c.x, c.z)) {
          if (Math.hypot(s.x - b.x, s.z - b.z) > reach) continue;
          const dgr = dangerAt(s.x, s.z, true, c.x, c.z) * bot.yieldEst;
          if (dgr < bestDanger) {
            bestDanger = dgr;
            best = s;
          }
        }
        // 그늘이 없으면 반대로 달릴 수 있는 만큼
        if (best.x === b.x && best.z === b.z) {
          const dx = b.x - c.x;
          const dz = b.z - c.z;
          const len = Math.hypot(dx, dz) || 1;
          best = { x: b.x + (dx / len) * reach, z: b.z + (dz / len) * reach };
        }
        bot.goal = best;
      }
      const g = bot.goal;
      const d = Math.hypot(g.x - b.x, g.z - b.z);
      const crouch = left <= p.crouchLeadMs;
      if (d < 0.15 || crouch) return { wx: 0, wz: 0, running: false, crouch };
      const sp = Math.min(BLAST_RUN_SPEED, d / dtSec);
      return { wx: ((g.x - b.x) / d) * sp, wz: ((g.z - b.z) / d) * sp, running: sp > BLAST_WALK_SPEED + 0.1, crouch: false };
    }

    // 사람 같은 좌석 — 폭심 반대로 뛴다. 자세는 습관대로
    const dx = b.x - c.x;
    const dz = b.z - c.z;
    const len = Math.hypot(dx, dz) || 1;
    const crouch = p.crouchLeadMs >= 0 && left <= p.crouchLeadMs;
    if (crouch) return { wx: (dx / len) * BLAST_CROUCH_SPEED, wz: (dz / len) * BLAST_CROUCH_SPEED, running: false, crouch: true };
    const far = len > BLAST_R * 0.8;
    const sp = far ? BLAST_WALK_SPEED : BLAST_RUN_SPEED;
    return { wx: (dx / len) * sp, wz: (dz / len) * sp, running: !far, crouch: false };
  }

  // 조용할 때 — 사람 같은 좌석은 이따금 자리를 옮긴다
  if (!p.computes) {
    if (bot.wanderGoal === null && rand() < p.wanderPerSec * dtSec) {
      const g = { x: b.x + (rand() - 0.5) * 6, z: b.z + (rand() - 0.5) * 6 };
      if (!insideCover(g.x, g.z)) bot.wanderGoal = g;
    }
    if (bot.wanderGoal) {
      const d = Math.hypot(bot.wanderGoal.x - b.x, bot.wanderGoal.z - b.z);
      if (d < 0.3) bot.wanderGoal = null;
      else return { wx: ((bot.wanderGoal.x - b.x) / d) * BLAST_WALK_SPEED, wz: ((bot.wanderGoal.z - b.z) / d) * BLAST_WALK_SPEED, running: false, crouch: false };
    }
  }
  return still;
}
