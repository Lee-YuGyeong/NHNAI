/**
 * AI 좌석의 탑 위 걸음 — PLANNING P9: 입력을 LLM 이 만들지 않는다. 프로파일(반응 지연 · 자리 습관 · 밀치기 성향)에서 틱마다 걷기와
 * 밀치기를 뽑는다. 사람과 같은 속도, 같은 물리(sim.ts)다.
 *
 * precision 1(기계 같음): **가장 안전한 발판**을 계산해 그 **정확한 가운데**에 선다 — 안쪽 고리 · 성함 · 남이 적은 곳(무게가 몰리면 기운다).
 *   발밑 발판에 경고가 뜨면 그 순간 옆 발판으로 옮긴다. 밀치기는 남이 자기 발판 끝 가까이(중심에서 0.55m 넘게) 서서 한 번에 떨어질 때만 —
 *   낭비가 없다. 기울기가 커지면(자기 몸 때문이 아니어도) 높은 쪽으로 반 걸음 옮겨 토크를 지운다.
 * precision 0(사람 같음): 경고를 알아채는 데 반응 지연이 있고, 발판 가운데가 아니라 아무 데나 선다(그래서 발판이 기운다). 남이 닿는 거리에
 *   있으면 성향대로 아무 때나 민다(밀어도 안 떨어질 자리에서도), 밀리면 놀라 반대로 뛰다 발판 끝을 넘기도 한다. 이따금 이유 없이 옆 발판으로 간다.
 *
 * 어느 좌석이 어느 쪽인지 서버는 말하지 않는다 — 기록(발판 가운데에서 떨어져 선 거리 · 낙하 · 반응 시간 · 밀치기)에만 남는다.
 */
import { TOWER_PUSH_COOLDOWN_MS, TOWER_PUSH_R, TOWER_RUN_SPEED, TOWER_SLAB, TOWER_WALK_SPEED, neighborsOf, ringOf, slabCenter } from '../../../../src/world/mp/tower';
import type { Slab, TowerBody } from './sim';

export interface TowerProfile {
  reactionMs: number;
  /** 서고 싶은 자리 — 발판 중심에서 이만큼(m) 벗어난 곳. 기계는 0 */
  offset: number;
  /** 남이 닿으면 미는 확률(초당). 기계는 조건이 맞을 때만 */
  shovePerSec: number;
  /** 이유 없이 옆 발판으로 갈 확률(초당) */
  wanderPerSec: number;
  computes: boolean;
}

export function makeTowerProfile(index: number, precision?: number, rand: () => number = Math.random): TowerProfile {
  const p = precision === undefined ? (index === 0 ? 1 : rand() * 0.35) : Math.min(1, Math.max(0, precision));
  const r = precision === undefined ? rand : () => 0.5;
  return {
    reactionMs: 60 + (1 - p) * (350 + r() * 350),
    offset: (1 - p) * (0.3 + r() * 0.45),
    shovePerSec: (1 - p) * (0.25 + r() * 0.5),
    wanderPerSec: (1 - p) * (0.04 + r() * 0.08),
    computes: p > 0.7,
  };
}

export interface TowerBot {
  body: TowerBody;
  profile: TowerProfile;
  /** 가려는 자리 */
  goal: { x: number; z: number } | null;
  /** 발밑 경고를 알아챈 시각 */
  warnedAt: number | null;
  /** 사람 같은 좌석이 자기 발판에서 고른 자리(중심 기준 오프셋) */
  spot: { dx: number; dz: number };
}

export function makeTowerBot(body: TowerBody, profile: TowerProfile, rand: () => number = Math.random): TowerBot {
  const a = rand() * Math.PI * 2;
  return { body, profile, goal: null, warnedAt: null, spot: { dx: Math.cos(a) * profile.offset, dz: Math.sin(a) * profile.offset } };
}

export interface BotOut {
  wx: number;
  wz: number;
  running: boolean;
  /** 밀칠 방향 — 없으면 null */
  push: { hx: number; hz: number } | null;
}

/** 안전한 발판 점수 — 낮을수록 좋다. 없거나 경고면 무한 */
function dangerOf(slabs: readonly Slab[], idx: number, bodies: readonly TowerBody[], selfId: string): number {
  const s = slabs[idx];
  if (!s || s.state !== 0) return Number.POSITIVE_INFINITY;
  let crowd = 0;
  for (const b of bodies) if (b.id !== selfId && b.stance === 'stand' && b.slab === idx) crowd += b.mass;
  // 닳은 발판은 곧 무너진다 — 계산하는 좌석은 그걸 안다(눈에 보이는 값이다: 가라앉고 붉다)
  return ringOf(idx) * 1.0 + crowd * 0.9 + Math.hypot(s.tx, s.tz) * 4 + s.wear * 3;
}

export function stepBot(bot: TowerBot, slabs: readonly Slab[], bodies: readonly TowerBody[], now: number, dtSec: number, rand: () => number = Math.random): BotOut {
  const b = bot.body;
  const p = bot.profile;
  const still: BotOut = { wx: 0, wz: 0, running: false, push: null };
  if (b.stance !== 'stand') {
    bot.goal = null;
    bot.warnedAt = null;
    return still;
  }
  const here = slabs[b.slab];
  const warned = !here || here.state !== 0;

  // 경고 — 알아채고(반응 지연) 가장 안전한 이웃으로. 딴 목표(제 자리 · 어슬렁)가 있어도 **덮어쓴다** — 그걸 안 덮어써서 경고 발판에 서서
  // 되돌아가려다 같이 떨어졌다 (2026-09-05 헤드리스 검문소: 봇 전원이 첫 마모 경고에 떨어졌다)
  if (warned) {
    if (bot.warnedAt === null) {
      bot.warnedAt = now;
      bot.goal = null;
    }
    if (now - bot.warnedAt >= p.reactionMs && !bot.goal) {
      const cands = neighborsOf(b.slab).filter((i) => slabs[i]?.state === 0);
      if (cands.length) {
        const best = p.computes ? cands.sort((x, y) => dangerOf(slabs, x, bodies, b.id) - dangerOf(slabs, y, bodies, b.id))[0] : cands[Math.floor(rand() * cands.length)];
        const c = slabCenter(best);
        bot.goal = { x: c.x + (p.computes ? 0 : bot.spot.dx), z: c.z + (p.computes ? 0 : bot.spot.dz) };
      }
    }
  } else {
    bot.warnedAt = null;
    if (p.computes) {
      // 지금 발판보다 뚜렷이 안전한 이웃이 있으면 옮긴다(안쪽으로 · 붐비지 않는 곳으로). 아니면 정확한 가운데 — 기울기가 있으면 높은 쪽으로 반 걸음
      const mine = dangerOf(slabs, b.slab, bodies, b.id);
      const cands = neighborsOf(b.slab).filter((i) => slabs[i]?.state === 0);
      const best = cands.sort((x, y) => dangerOf(slabs, x, bodies, b.id) - dangerOf(slabs, y, bodies, b.id))[0];
      // 뚜렷이 안전한 이웃이 있거나, 내 발판이 반 넘게 닳았으면 옮긴다 — 다 닳기 전에
      if (best !== undefined && !bot.goal && (dangerOf(slabs, best, bodies, b.id) < mine - 0.8 || here.wear > 0.55)) bot.goal = slabCenter(best);
      if (!bot.goal) {
        const c = slabCenter(b.slab);
        const tilt = Math.hypot(here.tx, here.tz);
        const k = tilt > 0.05 ? Math.min(0.6, tilt * 2) : 0;
        bot.goal = { x: c.x - (here.tx / (tilt || 1)) * k, z: c.z - (here.tz / (tilt || 1)) * k };
      }
    } else {
      // 사람 같은 좌석 — 자기 자리로. 이따금 이유 없이 옆 발판으로
      if (!bot.goal && rand() < p.wanderPerSec * dtSec) {
        const cands = neighborsOf(b.slab).filter((i) => slabs[i]?.state === 0);
        if (cands.length) {
          const c = slabCenter(cands[Math.floor(rand() * cands.length)]);
          bot.goal = { x: c.x + bot.spot.dx, z: c.z + bot.spot.dz };
        }
      }
      if (!bot.goal) {
        const c = slabCenter(b.slab);
        bot.goal = { x: c.x + bot.spot.dx, z: c.z + bot.spot.dz };
      }
    }
  }

  // 밀치기
  let push: BotOut['push'] = null;
  if (now - b.pushAt >= TOWER_PUSH_COOLDOWN_MS) {
    for (const o of bodies) {
      if (o.id === b.id || o.stance !== 'stand') continue;
      const dx = o.x - b.x;
      const dz = o.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d > TOWER_PUSH_R || d < 1e-6) continue;
      if (p.computes) {
        // 밀면 떨어질 때만 — 그 몸이 자기 발판 끝 가까이 있고, 미는 방향이 끝 쪽일 때
        const c = slabCenter(o.slab);
        const ox = o.x - c.x;
        const oz = o.z - c.z;
        const edge = Math.max(Math.abs(ox), Math.abs(oz));
        const outward = (ox * dx + oz * dz) / (d * (Math.hypot(ox, oz) || 1));
        if (edge > TOWER_SLAB / 2 - 0.45 && outward > 0.4) push = { hx: dx / d, hz: dz / d };
      } else if (rand() < p.shovePerSec * dtSec) push = { hx: dx / d, hz: dz / d };
      if (push) break;
    }
  }

  const g = bot.goal;
  if (!g) return { ...still, push };
  const dx = g.x - b.x;
  const dz = g.z - b.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.08) {
    bot.goal = null;
    return { ...still, push };
  }
  const far = d > 1.2 || warned;
  const sp = Math.min(far ? TOWER_RUN_SPEED : TOWER_WALK_SPEED, d / dtSec);
  return { wx: (dx / d) * sp, wz: (dz / d) * sp, running: sp > TOWER_WALK_SPEED + 0.1, push };
}
