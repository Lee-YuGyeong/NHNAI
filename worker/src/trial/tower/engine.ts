/**
 * 무너지는 타워 생존 엔진 — 1분 시간제. 회전 원판 · 다리와 같은 짜임: 물리 틱(50ms) · 스냅샷(100ms) · 20초마다 발판 마찰이 몰래 바뀐다
 * (phase.ts + condition.ts TOWER_GRIP). 끝나면 타이머를 즉시 지운다.
 *
 * **사람의 자리도 서버가 적분한다** — 기울어진 발판 위에서 미끄러지는 양과 밀린 뒤 서는 거리가 숨은 μ 에서 나온다. 클라는 걷기(trial_walk)와
 * 밀치기(trial_push)만 올리고 자리는 스냅샷(trial_tower)으로 돌려받는다. move 메시지는 이 게임에서 무시한다.
 *
 * 발판은 셋 가운데 하나로 무너진다 — 무게가 몰려 기울기가 상한을 넘거나(sim.stepSlab), 철거 차례가 와서 경고 뒤 떨어지거나. 그 위의 몸은 같이
 * 떨어진다(trial_fell). 밀쳐 떨어뜨린 것도 같은 낙하다. 밀린 몸에는 trial_hit(objectId = 미친 몸의 좌석 번호 대신 순번)을 보내 화면이 번쩍인다.
 */
import { jumpOf, massOf, runCapOf } from '../../../../src/world/mp/bodies';
import { TRIAL_GAME_MS } from '../../../../src/world/mp/constants';
import type { TrialPlayerResult } from '../../../../src/world/mp/protocol';
import {
  TOWER_BODY_MASS,
  TOWER_CENTER,
  TOWER_DEMOLISH_EVERY_MS,
  TOWER_DEMOLISH_FROM_MS,
  TOWER_FALL_KEEP_MS,
  TOWER_JUMP_GAP_MS,
  TOWER_N,
  TOWER_PUSH_COOLDOWN_MS,
  TOWER_QUAKE_EVERY_MS,
  TOWER_QUAKE_FROM_MS,
  TOWER_QUAKE_KICK,
  TOWER_QUAKE_SHOVE,
  TOWER_RUN_SPEED,
  TOWER_SNAPSHOT_MS,
  TOWER_TICK_MS,
  TOWER_WALK_SPEED,
  TOWER_WALK_STALE_MS,
  TOWER_WARN_MS,
  TOWER_WEAR_S,
  ringOf,
  slabCenter,
} from '../../../../src/world/mp/tower';
import { gripOf } from '../../../../src/world/mp/bodies';
import { TOWER_GRIP } from '../condition';
import type { EngineContext, GameEngine, SeatTuning } from '../engine';
import { phaseAt, phaseStarts } from '../phase';
import type { TrialCondition } from '../types';
import { makeTowerBot, makeTowerProfile, stepBot, type TowerBot, type TowerProfile } from './npc';
import { clampWalk, fall, gripForPhase, impact, jump, makeBody, makeSlabs, respawn, separate, shove, standable, stepBody, stepSlab, type Slab, type SlabLoad, type TowerBody } from './sim';
import { TowerStats } from './stats';

export class TowerEngine implements GameEngine {
  readonly game = 'tower' as const;
  readonly durationMs = TRIAL_GAME_MS;

  private ctx: EngineContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private endedAt = 0;
  private lastTick = 0;
  private lastSnapshot = 0;
  private slabs: Slab[] = makeSlabs();
  private bodies = new Map<string, TowerBody>();
  private stats = new Map<string, TowerStats>();
  private bots: TowerBot[] = [];
  private profiles = new Map<string, TowerProfile>();
  private nextDemolishAt = 0;
  private nextQuakeAt = 0;
  private pushSeq = 0;
  private readonly rand: () => number;

  constructor(rand: () => number = Math.random) {
    this.rand = rand;
  }

  condition(): TrialCondition {
    return { towerGrip: TOWER_GRIP };
  }

  start(_round: number, realIds: readonly string[], aiIds: readonly string[], ctx: EngineContext, tuning?: Record<string, SeatTuning>): void {
    this.stop();
    this.ctx = ctx;
    const now = Date.now();
    this.startedAt = now;
    this.endedAt = 0;
    this.lastTick = now;
    this.lastSnapshot = now;
    this.slabs = makeSlabs();
    this.bodies = new Map();
    this.stats = new Map();
    this.nextDemolishAt = now + TOWER_DEMOLISH_FROM_MS;
    this.nextQuakeAt = now + TOWER_QUAKE_FROM_MS;
    this.pushSeq = 0;

    // 전원이 안쪽 고리(가운데 둘레 여덟)에 흩어져 선다 — 서로 다른 발판에, 발판 가운데
    const inner = this.slabs.map((s) => s.idx).filter((i) => ringOf(i) === 1);
    const all = [...realIds, ...aiIds];
    all.forEach((id, k) => this.place(id, inner[(k * 3) % inner.length]));

    this.bots = aiIds.map((id, i) => {
      const t = tuning?.[id];
      let profile = this.profiles.get(id);
      if (t || !profile) {
        profile = makeTowerProfile(i, t?.precision, this.rand);
        this.profiles.set(id, profile);
      }
      return makeTowerBot(this.bodies.get(id)!, profile, this.rand);
    });

    this.timer = setInterval(() => this.tick(), TOWER_TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  join(id: string): void {
    if (this.bodies.has(id)) return;
    this.place(id, this.safestSlab());
  }

  private place(id: string, idx: number): void {
    const c = slabCenter(idx);
    const b = makeBody(id, c.x, c.z, massOf(this.ctx?.bodyOf?.(id)));
    this.bodies.set(id, b);
    this.stats.set(id, new TowerStats());
    respawn(b, this.slabs, idx);
  }

  /** 다시 설 발판 — 성한 것 가운데 안쪽 고리 · 사람이 적은 곳 */
  private safestSlab(): number {
    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const s of this.slabs) {
      if (s.state !== 0) continue;
      let crowd = 0;
      for (const b of this.bodies.values()) if (b.stance === 'stand' && b.slab === s.idx) crowd += 1;
      const score = ringOf(s.idx) * 2 + crowd + this.rand() * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = s.idx;
      }
    }
    return best >= 0 ? best : Math.floor((TOWER_N * TOWER_N) / 2);
  }

  onAccel(): void {
    /* 없다 */
  }

  onBrake(): void {
    /* 없다 */
  }

  onPick(): void {
    /* 없다 */
  }

  onMove(): void {
    /* 이 게임은 자리를 신고받지 않는다 — 서버가 적분한다 (머리말) */
  }

  onWalk(id: string, x: number, z: number, now: number): void {
    this.join(id);
    const b = this.bodies.get(id)!;
    const w = clampWalk(x, z, runCapOf(this.ctx?.bodyOf?.(id), TOWER_RUN_SPEED));
    b.wx = w.x;
    b.wz = w.z;
    b.running = Math.hypot(w.x, w.z) > TOWER_WALK_SPEED + 0.1;
    b.wAt = now;
    if (Math.hypot(w.x, w.z) > 0.05) b.heading = Math.atan2(w.x, w.z);
    this.stats.get(id)?.walk(w.x, w.z, now);
  }

  onPush(id: string, hx: number, hz: number, now: number): void {
    this.join(id);
    const me = this.bodies.get(id)!;
    this.doPush(me, hx, hz, now);
  }

  /** 점프(Space) — 몸의 점프 속도(mp/bodies.ts)로 뜬다. 뜬 동안은 조작이 없다 */
  onJump(id: string, now: number): void {
    this.join(id);
    const b = this.bodies.get(id)!;
    if (now - b.jumpAt < TOWER_JUMP_GAP_MS) return;
    const stale = now - b.wAt > TOWER_WALK_STALE_MS;
    if (jump(b, stale ? 0 : b.wx, stale ? 0 : b.wz, jumpOf(this.ctx?.bodyOf?.(id), 6.8), now)) this.stats.get(id)?.jumped();
  }

  private doPush(me: TowerBody, hx: number, hz: number, now: number): void {
    if (now - me.pushAt < TOWER_PUSH_COOLDOWN_MS || me.stance !== 'stand') return;
    me.pushAt = now;
    if (Number.isFinite(hx) && Number.isFinite(hz) && Math.hypot(hx, hz) > 1e-6) me.heading = Math.atan2(hx, hz);
    const hit = shove(me, [...this.bodies.values()], hx, hz);
    if (!hit) return;
    this.pushSeq += 1;
    this.stats.get(me.id)?.pushed();
    this.stats.get(hit.id)?.gotShoved();
    this.ctx?.broadcast({ t: 'trial_hit', id: hit.id, objectId: this.pushSeq });
  }

  done(): boolean {
    return this.endedAt !== 0;
  }

  results(): TrialPlayerResult[] {
    const end = this.endedAt || Date.now();
    return [...this.stats].map(([id, s]) => s.result(id, this.startedAt, end));
  }

  /** 시험용 */
  bodyOf(id: string): TowerBody | undefined {
    return this.bodies.get(id);
  }

  slabList(): readonly Slab[] {
    return this.slabs;
  }

  /** 시험용 — 다음 진동 시각 */
  quakeAt(): number {
    return this.nextQuakeAt;
  }

  /** 시험용 — 이 발판에 지금 경고를 건다 */
  warn(idx: number, now: number): void {
    const s = this.slabs[idx];
    if (!s || s.state !== 0) return;
    s.state = 1;
    s.at = now;
    for (const b of this.bodies.values()) if (b.stance === 'stand' && b.slab === idx) this.stats.get(b.id)?.warned(now);
  }

  tickAt(now: number): void {
    this.step(now);
  }

  private tick(): void {
    this.step(Date.now());
  }

  private breakSlab(s: Slab, now: number): void {
    s.state = 2;
    s.at = now;
    for (const b of this.bodies.values()) {
      if (b.stance === 'stand' && b.slab === s.idx) {
        fall(b, b.wx * 0.3 + b.sx, b.wz * 0.3 + b.sz);
        this.stats.get(b.id)?.fell(now);
        this.ctx?.broadcast({ t: 'trial_fell', id: b.id });
      }
    }
  }

  private step(now: number): void {
    const ctx = this.ctx;
    if (!ctx || this.endedAt !== 0) return;
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;

    if (now - this.startedAt >= TRIAL_GAME_MS) {
      this.endedAt = now;
      this.stop();
      ctx.finish();
      return;
    }
    const mu = gripForPhase(phaseAt(now - this.startedAt));
    const starts = phaseStarts(this.startedAt);

    // 발판이 전부 떨어졌다 — 기다릴 것이 없다. 그 자리에서 닫고 기록을 띄운다
    if (this.slabs.every((s) => s.state >= 2)) {
      this.endedAt = now;
      this.stop();
      ctx.finish();
      return;
    }

    // 철거 — 바깥 고리에서 하나씩. 가운데(고리 0)는 남긴다. 경고가 익으면 떨어진다, 떨어진 것은 잠시 뒤 없어진다
    if (now >= this.nextDemolishAt) {
      const ring = Math.max(...this.slabs.filter((s) => s.state === 0 && ringOf(s.idx) > 0).map((s) => ringOf(s.idx)), 0);
      const cands = this.slabs.filter((s) => s.state === 0 && ringOf(s.idx) === ring && ring > 0);
      if (cands.length) this.warn(cands[Math.floor(this.rand() * cands.length)].idx, now);
      this.nextDemolishAt = now + TOWER_DEMOLISH_EVERY_MS;
    }
    for (const s of this.slabs) {
      if (s.state === 1 && now - s.at >= TOWER_WARN_MS) this.breakSlab(s, now);
      else if (s.state === 2 && now - s.at >= TOWER_FALL_KEEP_MS) s.state = 3;
    }

    // 진동 — 전 발판에 무작위 각속도, 전원의 발에 무작위 미끄러짐. 기록에는 「사건」(반응을 잰다)
    if (now >= this.nextQuakeAt) {
      for (const s of this.slabs) {
        if (s.state >= 2) continue;
        const a = this.rand() * Math.PI * 2;
        const k = TOWER_QUAKE_KICK * (0.6 + 0.4 * this.rand());
        s.vx += Math.cos(a) * k;
        s.vz += Math.sin(a) * k;
      }
      for (const b of this.bodies.values()) {
        if (b.stance !== 'stand') continue;
        const a = this.rand() * Math.PI * 2;
        b.sx += Math.cos(a) * TOWER_QUAKE_SHOVE;
        b.sz += Math.sin(a) * TOWER_QUAKE_SHOVE;
        this.stats.get(b.id)?.warned(now);
      }
      this.nextQuakeAt = now + TOWER_QUAKE_EVERY_MS[0] + this.rand() * (TOWER_QUAKE_EVERY_MS[1] - TOWER_QUAKE_EVERY_MS[0]);
    }

    // 봇의 명령
    const bodyList = [...this.bodies.values()];
    const botCmd = new Map<string, { wx: number; wz: number }>();
    for (const bot of this.bots) {
      const out = stepBot(bot, this.slabs, bodyList, now, dt, this.rand);
      botCmd.set(bot.body.id, { wx: out.wx, wz: out.wz });
      const b = bot.body;
      b.running = out.running;
      b.wx = out.wx;
      b.wz = out.wz;
      b.wAt = now;
      if (Math.hypot(out.wx, out.wz) > 0.05) b.heading = Math.atan2(out.wx, out.wz);
      this.stats.get(b.id)?.walk(out.wx, out.wz, now);
      if (out.push) this.doPush(b, out.push.hx, out.push.hz, now);
    }

    // 발판 — 그 위 무게로 기울고 닳는다. 기울기 상한을 넘으면 부서지고, 다 닳으면 경고가 뜬다
    const wearPerKgSec = 1 / (TOWER_BODY_MASS * TOWER_WEAR_S);
    for (const s of this.slabs) {
      if (s.state >= 2) continue;
      const loads: SlabLoad[] = [];
      const c = slabCenter(s.idx);
      for (const b of bodyList) if (b.stance === 'stand' && b.slab === s.idx) loads.push({ dx: b.x - c.x, dz: b.z - c.z, mass: b.mass * TOWER_BODY_MASS });
      if (stepSlab(s, loads, dt, wearPerKgSec)) this.breakSlab(s, now);
      else if (s.state === 0 && s.wear >= 1) this.warn(s.idx, now);
    }

    // 몸
    for (const b of bodyList) {
      const st = this.stats.get(b.id);
      if (b.stance === 'down') {
        if (now >= b.upAt) {
          const idx = this.safestSlab();
          if (standable(this.slabs, idx)) respawn(b, this.slabs, idx, (this.rand() - 0.5) * 0.4, (this.rand() - 0.5) * 0.4);
        }
        continue;
      }
      let cmd = botCmd.get(b.id);
      if (!cmd) {
        const stale = now - b.wAt > TOWER_WALK_STALE_MS;
        cmd = stale ? { wx: 0, wz: 0 } : { wx: b.wx, wz: b.wz };
      }
      const wasStanding = b.stance === 'stand';
      const out = stepBody(b, this.slabs, cmd.wx, cmd.wz, mu * gripOf(ctx.bodyOf?.(b.id)), dt, now);
      if (out.fell && (wasStanding || b.stance === 'air')) {
        st?.fell(now);
        ctx.broadcast({ t: 'trial_fell', id: b.id });
      }
      if (out.touchdown) {
        // 착지 충격 — 내려앉은 자리만큼 발판이 기운다. 닳은 발판 끝에 뛰어내리면 여기서 무너진다
        const s = this.slabs[out.touchdown.slab];
        const c = slabCenter(s.idx);
        impact(s, b.x - c.x, b.z - c.z, b.mass * TOWER_BODY_MASS, out.touchdown.speed);
      }
      if (b.stance === 'stand') {
        const c = slabCenter(b.slab);
        st?.tick(Math.hypot(b.x - c.x, b.z - c.z), Math.hypot(b.x - TOWER_CENTER.x, b.z - TOWER_CENTER.z), out.slide, out.walked, dt, now, starts);
      }
    }
    separate(bodyList);

    if (now - this.lastSnapshot >= TOWER_SNAPSHOT_MS) {
      this.lastSnapshot = now;
      ctx.broadcast({
        t: 'trial_tower',
        at: now,
        slabs: this.slabs.filter((s) => s.state < 3).map((s) => ({ i: s.idx, tx: r3(s.tx), tz: r3(s.tz), s: s.state, at: s.at, w: r2(s.wear) })),
        quakeAt: this.nextQuakeAt,
        players: bodyList.map((b) => {
          const wLen = Math.hypot(b.wx, b.wz);
          const moving = b.stance === 'stand' && now - b.wAt <= TOWER_WALK_STALE_MS && wLen > 0.05;
          return {
            id: b.id,
            x: r2(b.x),
            z: r2(b.z),
            y: r2(b.y),
            h: r2(b.heading),
            m: moving ? (b.running ? 2 : 1) : 0,
            f: b.stance === 'air' ? 1 : b.stance === 'down' ? 2 : 0,
            sx: r2(b.sx),
            sz: r2(b.sz),
            vx: r2(b.vx),
            vy: r2(b.vy),
            vz: r2(b.vz),
          };
        }),
      });
    }
  }
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
function r3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
