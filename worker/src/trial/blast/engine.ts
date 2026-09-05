/**
 * 폭발 충격파 피하기 엔진 — 1분 시간제. 회전 원판 · 무게 중심 다리와 같은 짜임: setInterval 로 물리 틱(50ms)을 돌리고 스냅샷(100ms)을 뿌리며,
 * 20초마다 폭약 세기가 몰래 바뀐다(phase.ts + condition.ts BLAST_YIELD). 끝나면 타이머를 즉시 지운다.
 *
 * **사람의 자리도 서버가 적분한다** — 충격파가 몸을 띄우는 속도가 숨은 세기에서 나오므로, 클라는 걷기 명령(trial_walk)과 자세(trial_crouch)만
 * 올리고 자리는 스냅샷(trial_blast)으로 돌려받는다. move 메시지는 이 게임에서 무시한다.
 *
 * 폭약은 1.5~2.6초마다 마당 아무 자리에 놓이고(빨간 등이 깜박이는 도화선 1.8초) 터진다. 터진 폭심 가까이의 다른 폭약은 따라 터진다 — 연쇄.
 * 몸이 날아가면 trial_hit(낙하 생존의 피격과 같은 메시지 — objectId 는 폭약 번호)을 뿌린다 — 그 사람 화면이 붉게 번쩍이는 데 쓴다.
 */
import { massOf, runCapOf } from '../../../../src/world/mp/bodies';
import {
  BLAST_ARENA,
  BLAST_BOOM_KEEP_MS,
  BLAST_CHAIN_DELAY_MS,
  BLAST_CHAIN_R,
  BLAST_EVERY_MS,
  BLAST_FUSE_MS,
  BLAST_MAX_ARMED,
  BLAST_R,
  BLAST_RUN_SPEED,
  BLAST_SNAPSHOT_MS,
  BLAST_TICK_MS,
  BLAST_WALK_SPEED,
  BLAST_WALK_STALE_MS,
  insideCover,
} from '../../../../src/world/mp/blast';
import { TRIAL_GAME_MS } from '../../../../src/world/mp/constants';
import type { TrialPlayerResult } from '../../../../src/world/mp/protocol';
import { BLAST_YIELD } from '../condition';
import type { EngineContext, GameEngine, SeatTuning } from '../engine';
import { phaseAt, phaseStarts } from '../phase';
import type { TrialCondition } from '../types';
import { botLaunched, makeBlastBot, makeBlastProfile, stepBot, type BlastBot, type BlastProfile } from './npc';
import { applyBlast, clampWalk, makeBody, stepBody, yieldForPhase, type BlastBody, type Boom, type Charge } from './sim';
import { BlastStats, NEAR_ARM } from './stats';

export class BlastEngine implements GameEngine {
  readonly game = 'blast' as const;
  readonly durationMs = TRIAL_GAME_MS;

  private ctx: EngineContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private endedAt = 0;
  private lastTick = 0;
  private lastSnapshot = 0;
  private bodies = new Map<string, BlastBody>();
  private headings = new Map<string, number>();
  private stats = new Map<string, BlastStats>();
  private bots: BlastBot[] = [];
  private profiles = new Map<string, BlastProfile>();
  private charges: Charge[] = [];
  private booms: Boom[] = [];
  private nextArmAt = 0;
  private seq = 0;
  private readonly rand: () => number;

  constructor(rand: () => number = Math.random) {
    this.rand = rand;
  }

  condition(): TrialCondition {
    return { blastYield: BLAST_YIELD };
  }

  start(_round: number, realIds: readonly string[], aiIds: readonly string[], ctx: EngineContext, tuning?: Record<string, SeatTuning>): void {
    this.stop();
    this.ctx = ctx;
    const now = Date.now();
    this.startedAt = now;
    this.endedAt = 0;
    this.lastTick = now;
    this.lastSnapshot = now;
    this.bodies = new Map();
    this.headings = new Map();
    this.stats = new Map();
    this.charges = [];
    this.booms = [];
    this.seq = 0;
    this.nextArmAt = now + 2500;

    for (const id of [...realIds, ...aiIds]) this.join(id);

    this.bots = aiIds.map((id, i) => {
      const t = tuning?.[id];
      let profile = this.profiles.get(id);
      if (t || !profile) {
        profile = makeBlastProfile(i, t?.precision, this.rand);
        this.profiles.set(id, profile);
      }
      return makeBlastBot(this.bodies.get(id)!, profile);
    });

    this.timer = setInterval(() => this.tick(), BLAST_TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  join(id: string): void {
    if (this.bodies.has(id)) return;
    const p = this.freeSpot(1.0);
    this.bodies.set(id, makeBody(id, p.x, p.z, massOf(this.ctx?.bodyOf?.(id))));
    this.stats.set(id, new BlastStats());
  }

  /** 장애물 · 다른 몸과 겹치지 않는 자리 — 열 번 안에 못 찾으면 마지막 후보 */
  private freeSpot(pad: number): { x: number; z: number } {
    let p = { x: 0, z: 0 };
    for (let i = 0; i < 12; i += 1) {
      p = {
        x: BLAST_ARENA.minX + 1 + this.rand() * (BLAST_ARENA.maxX - BLAST_ARENA.minX - 2),
        z: BLAST_ARENA.minZ + 1 + this.rand() * (BLAST_ARENA.maxZ - BLAST_ARENA.minZ - 2),
      };
      if (insideCover(p.x, p.z, pad)) continue;
      let clash = false;
      for (const b of this.bodies.values()) if (Math.hypot(b.x - p.x, b.z - p.z) < 1.2) clash = true;
      if (!clash) break;
    }
    return p;
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
    const w = clampWalk(x, z, runCapOf(this.ctx?.bodyOf?.(id), BLAST_RUN_SPEED));
    b.wx = w.x;
    b.wz = w.z;
    b.running = Math.hypot(w.x, w.z) > BLAST_WALK_SPEED + 0.1;
    b.wAt = now;
    this.stats.get(id)?.walk(w.x, w.z, now);
  }

  onCrouch(id: string, on: boolean, now: number): void {
    this.join(id);
    const b = this.bodies.get(id)!;
    if (b.crouch !== on) this.stats.get(id)?.crouch(on, now);
    b.crouch = on;
  }

  done(): boolean {
    return this.endedAt !== 0;
  }

  results(): TrialPlayerResult[] {
    const end = this.endedAt || Date.now();
    return [...this.stats].map(([id, s]) => s.result(id, this.startedAt, end));
  }

  /** 시험용 */
  bodyOf(id: string): BlastBody | undefined {
    return this.bodies.get(id);
  }

  chargeList(): readonly Charge[] {
    return this.charges;
  }

  /** 시험용 — 지금 이 자리에 폭약을 놓는다 (도화선은 그대로) */
  plant(x: number, z: number, now: number, fuseMs = BLAST_FUSE_MS): Charge {
    this.seq += 1;
    const c: Charge = { id: this.seq, x, z, armAt: now, boomAt: now + fuseMs };
    this.charges.push(c);
    for (const b of this.bodies.values()) if (Math.hypot(b.x - x, b.z - z) <= NEAR_ARM) this.stats.get(b.id)?.armedNear(now);
    return c;
  }

  tickAt(now: number): void {
    this.step(now);
  }

  private tick(): void {
    this.step(Date.now());
  }

  private step(now: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;

    if (now - this.startedAt >= TRIAL_GAME_MS) {
      this.endedAt = now;
      this.stop();
      ctx.finish();
      return;
    }
    const yieldK = yieldForPhase(phaseAt(now - this.startedAt));
    const starts = phaseStarts(this.startedAt);

    // 새 폭약 — 마당 아무 자리(장애물 안은 아니다). 몸 바로 옆도 된다 — 그게 이 판의 위험이다
    if (now >= this.nextArmAt && this.charges.length < BLAST_MAX_ARMED) {
      const p = this.freeSpot(0.9);
      this.plant(p.x, p.z, now);
      this.nextArmAt = now + BLAST_EVERY_MS[0] + this.rand() * (BLAST_EVERY_MS[1] - BLAST_EVERY_MS[0]);
    }

    // 터지는 것 — 시각이 된 폭약 전부. 연쇄는 남은 폭약의 boomAt 을 앞당긴다
    const due = this.charges.filter((c) => c.boomAt <= now).sort((a, b) => a.boomAt - b.boomAt);
    if (due.length) {
      this.charges = this.charges.filter((c) => c.boomAt > now);
      for (const c of due) {
        this.booms.push({ id: c.id, x: c.x, z: c.z, at: now });
        for (const o of this.charges) {
          if (Math.hypot(o.x - c.x, o.z - c.z) <= BLAST_CHAIN_R) o.boomAt = Math.min(o.boomAt, now + BLAST_CHAIN_DELAY_MS);
        }
        for (const b of this.bodies.values()) {
          const dx = b.x - c.x;
          const dz = b.z - c.z;
          const d = Math.hypot(dx, dz);
          // 터지는 순간 폭심 쪽으로 움직이고 있었나 — 걷기 명령과 폭심 방향의 내적
          const toward = -(b.wx * dx + b.wz * dz) > 0.1;
          const wasStanding = b.stance === 'stand';
          const out = applyBlast(b, c.x, c.z, yieldK);
          const st = this.stats.get(b.id);
          if (d < BLAST_R) st?.exposed(out.shielded || (b.crouch && wasStanding));
          if (out.launched && wasStanding) {
            st?.launched(now, toward);
            ctx.broadcast({ t: 'trial_hit', id: b.id, objectId: c.id });
            const bot = this.bots.find((x) => x.body.id === b.id);
            if (bot) botLaunched(bot, out.v, d);
          }
        }
      }
    }
    this.booms = this.booms.filter((bm) => now - bm.at <= BLAST_BOOM_KEEP_MS);

    // 봇의 명령
    const botCmd = new Map<string, { wx: number; wz: number }>();
    for (const bot of this.bots) {
      const out = stepBot(bot, this.charges, now, dt, this.rand);
      botCmd.set(bot.body.id, { wx: out.wx, wz: out.wz });
      const b = bot.body;
      if (b.crouch !== out.crouch) this.stats.get(b.id)?.crouch(out.crouch, now);
      b.crouch = out.crouch;
      b.running = out.running;
      b.wx = out.wx;
      b.wz = out.wz;
      b.wAt = now;
      this.stats.get(b.id)?.walk(out.wx, out.wz, now);
    }

    for (const b of this.bodies.values()) {
      let cmd = botCmd.get(b.id);
      if (!cmd) {
        const stale = now - b.wAt > BLAST_WALK_STALE_MS;
        cmd = stale ? { wx: 0, wz: 0 } : { wx: b.wx, wz: b.wz };
      }
      const out = stepBody(b, cmd.wx, cmd.wz, dt, now);
      const st = this.stats.get(b.id);
      st?.tick(out.walked);
      if (out.landed !== null) st?.landed(out.landed, now, starts);
      if (Math.hypot(cmd.wx, cmd.wz) > 0.05 && b.stance === 'stand') this.headings.set(b.id, Math.atan2(cmd.wx, cmd.wz));
    }

    if (now - this.lastSnapshot >= BLAST_SNAPSHOT_MS) {
      this.lastSnapshot = now;
      ctx.broadcast({
        t: 'trial_blast',
        at: now,
        players: [...this.bodies.values()].map((b) => {
          const wLen = Math.hypot(b.wx, b.wz);
          const moving = b.stance === 'stand' && now - b.wAt <= BLAST_WALK_STALE_MS && wLen > 0.05;
          return {
            id: b.id,
            x: r2(b.x),
            z: r2(b.z),
            y: r2(b.y),
            vx: r2(b.vx),
            vz: r2(b.vz),
            vy: r2(b.vy),
            h: r2(this.headings.get(b.id) ?? 0),
            m: moving ? (b.running ? 2 : 1) : 0,
            f: b.stance === 'air' ? 1 : b.stance === 'down' ? 2 : 0,
            c: b.crouch ? 1 : 0,
          };
        }),
        charges: this.charges.map((c) => ({ id: c.id, x: r2(c.x), z: r2(c.z), at: c.armAt, boomAt: c.boomAt })),
        booms: this.booms.map((bm) => ({ id: bm.id, x: r2(bm.x), z: r2(bm.z), at: bm.at })),
      });
    }
  }
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
