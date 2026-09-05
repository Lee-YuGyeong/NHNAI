/**
 * 무게 중심 다리 엔진 — 1분 시간제. 회전 원판(disc/engine.ts)과 같은 짜임: setInterval 로 물리 틱(50ms)을 돌리고 스냅샷(100ms)을
 * 뿌리며, 20초마다 판자 윗면 마찰이 몰래 바뀐다(phase.ts + condition.ts SEESAW_GRIP). 끝나면 타이머를 즉시 지운다.
 *
 * **사람의 자리도 서버가 적분한다** — 판이 기울면 발이 미끄러지는데 그 미끄러짐이 숨은 μ 에서 나오므로, 클라는 걷기 명령(trial_walk,
 * 월드 기준 속도)만 올리고 자리는 스냅샷(trial_seesaw)으로 돌려받는다. move 메시지는 이 게임에서 무시한다.
 *
 * 판을 흔드는 사건은 **상자**다 — 크레인이 5~8초마다 판 위 아무 자리에 화물을 내려놓는다(닿는 순간부터 무게). 무리는 반대쪽으로
 * 옮겨 가 균형을 되찾아야 하고(사용자 스펙 "서로 반대쪽으로 뛰면서 균형 유지"), 그 순간이 기록의 반응 시간 기준이다.
 * 몸(mp/bodies.ts): 무거운 몸은 질량 배율(mass 1.8)만큼 토크가 크다 — 비만 군인 하나가 보통 둘 몫이다. 달리기 상한도 그 몸의 것.
 */
import { massOf, runCapOf } from '../../../../src/world/mp/bodies';
import {
  SEESAW_BODY_MASS,
  SEESAW_CRATE_DROP_MS,
  SEESAW_CRATE_EVERY_MS,
  SEESAW_CRATE_MAX,
  SEESAW_CRATE_STAY_MS,
  SEESAW_CRATE_U,
  SEESAW_HALF_W,
  SEESAW_RUN_SPEED,
  SEESAW_SNAPSHOT_MS,
  SEESAW_TICK_MS,
  SEESAW_WALK_SPEED,
  SEESAW_WALK_STALE_MS,
  TRIAL_GAME_MS,
} from '../../../../src/world/mp/constants';
import type { TrialPlayerResult } from '../../../../src/world/mp/protocol';
import { SEESAW_GRIP } from '../condition';
import type { EngineContext, GameEngine, SeatTuning } from '../engine';
import { phaseAt, phaseStarts } from '../phase';
import type { TrialCondition } from '../types';
import { botLoadEvent, makeSeesawBot, makeSeesawProfile, stepBot, type SeesawBot, type SeesawProfile } from './npc';
import { clampWalk, gripForPhase, makeBody, makeCrate, makePlank, respawn, stepBody, stepCrate, stepPlank, type Crate, type Load, type Plank, type SeesawBody } from './sim';
import { SeesawStats } from './stats';

export class SeesawEngine implements GameEngine {
  readonly game = 'seesaw' as const;
  readonly durationMs = TRIAL_GAME_MS;

  private ctx: EngineContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private endedAt = 0;
  private lastTick = 0;
  private lastSnapshot = 0;
  private plank: Plank = makePlank();
  private bodies = new Map<string, SeesawBody>();
  private stats = new Map<string, SeesawStats>();
  private bots: SeesawBot[] = [];
  private profiles = new Map<string, SeesawProfile>();
  private crates: Crate[] = [];
  private nextCrateAt = 0;
  private crateSeq = 0;
  private readonly rand: () => number;

  constructor(rand: () => number = Math.random) {
    this.rand = rand;
  }

  condition(): TrialCondition {
    return { seesawGrip: SEESAW_GRIP };
  }

  start(_round: number, realIds: readonly string[], aiIds: readonly string[], ctx: EngineContext, tuning?: Record<string, SeatTuning>): void {
    this.stop();
    this.ctx = ctx;
    const now = Date.now();
    this.startedAt = now;
    this.endedAt = 0;
    this.lastTick = now;
    this.lastSnapshot = now;
    this.plank = makePlank();
    this.bodies = new Map();
    this.stats = new Map();
    this.crates = [];
    this.crateSeq = 0;
    this.nextCrateAt = now + 3000 + this.rand() * 2000;

    // 전원이 축 양옆에 번갈아 선다 — 출발부터 균형이 맞게. 폭 방향은 조금씩 어긋나 겹치지 않게
    const all = [...realIds, ...aiIds];
    all.forEach((id, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const u = side * (1.2 + Math.floor(i / 2) * 1.2);
      const v = ((i % 3) - 1) * 0.7;
      this.place(id, u, v);
    });

    this.bots = aiIds.map((id, i) => {
      const t = tuning?.[id];
      let profile = this.profiles.get(id);
      if (t || !profile) {
        profile = makeSeesawProfile(i, t?.precision, this.rand);
        this.profiles.set(id, profile);
      }
      return makeSeesawBot(this.bodies.get(id)!, profile);
    });

    this.timer = setInterval(() => this.tick(), SEESAW_TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  join(id: string): void {
    if (!this.bodies.has(id)) this.place(id, (this.rand() < 0.5 ? -1 : 1) * 0.8, 0);
  }

  private place(id: string, u: number, v: number): void {
    this.bodies.set(id, makeBody(id, u, v, SEESAW_BODY_MASS * massOf(this.ctx?.bodyOf?.(id))));
    this.stats.set(id, new SeesawStats());
  }

  onAccel(): void {
    /* 판자에는 W/S 시행이 없다 */
  }

  onBrake(): void {
    /* 위와 같다 */
  }

  onPick(): void {
    /* 줍기도 없다 */
  }

  onMove(): void {
    /* 이 게임은 자리를 신고받지 않는다 — 서버가 적분한다 (머리말) */
  }

  /** 걷기 명령(월드 기준, m/s). 상한으로 자르고 시각을 적는다 — 반응 시간은 여기서 잰다 */
  onWalk(id: string, x: number, z: number, now: number): void {
    this.join(id);
    const b = this.bodies.get(id)!;
    const w = clampWalk(x, z, runCapOf(this.ctx?.bodyOf?.(id), SEESAW_RUN_SPEED));
    b.wx = w.x;
    b.wz = w.z;
    b.running = Math.hypot(w.x, w.z) > SEESAW_WALK_SPEED + 0.1;
    b.wAt = now;
    this.stats.get(id)?.walk(w.x, w.z, now);
  }

  done(): boolean {
    return this.endedAt !== 0;
  }

  results(): TrialPlayerResult[] {
    const end = this.endedAt || Date.now();
    return [...this.stats].map(([id, s]) => s.result(id, this.startedAt, end));
  }

  /** 시험용 — 지금 판자 상태 */
  plankState(): Readonly<Plank> {
    return this.plank;
  }

  bodyOf(id: string): SeesawBody | undefined {
    return this.bodies.get(id);
  }

  crateList(): readonly Crate[] {
    return this.crates;
  }

  /** 시험용 — 실제 시계 없이 한 틱을 돌린다 */
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
    const mu = gripForPhase(phaseAt(now - this.startedAt));
    const starts = phaseStarts(this.startedAt);

    // 상자 — 크레인이 새 상자를 내린다 · 닿는 순간은 사건 · 머무는 시간이 지나면 걷어 간다 · 미끄러져 끝을 넘으면 떨어진다
    if (now >= this.nextCrateAt && this.crates.length < SEESAW_CRATE_MAX) {
      const side = this.rand() < 0.5 ? -1 : 1;
      const u = side * (SEESAW_CRATE_U[0] + this.rand() * (SEESAW_CRATE_U[1] - SEESAW_CRATE_U[0]));
      const v = (this.rand() - 0.5) * (SEESAW_HALF_W - 0.8);
      const landAt = now + SEESAW_CRATE_DROP_MS;
      const liftAt = landAt + SEESAW_CRATE_STAY_MS[0] + this.rand() * (SEESAW_CRATE_STAY_MS[1] - SEESAW_CRATE_STAY_MS[0]);
      this.crateSeq += 1;
      this.crates.push(makeCrate(this.crateSeq, u, v, landAt, liftAt));
      this.nextCrateAt = now + SEESAW_CRATE_EVERY_MS[0] + this.rand() * (SEESAW_CRATE_EVERY_MS[1] - SEESAW_CRATE_EVERY_MS[0]);
    }
    let event = false;
    this.crates = this.crates.filter((c) => {
      if (now >= c.liftAt) return false;
      if (c.landAt > now - dt * 1000 && c.landAt <= now) event = true; // 이 틱에 닿았다
      return !stepCrate(c, this.plank.phi, mu, dt, now);
    });

    // 판자 — 판 위 무게 전부(닿은 상자 + 서 있는 몸)
    const loads: (Load & { id?: string })[] = [];
    for (const c of this.crates) if (now >= c.landAt) loads.push({ u: c.u, mass: c.mass });
    for (const b of this.bodies.values()) if (b.on) loads.push({ u: b.u, mass: b.mass, id: b.id });
    const out = stepPlank(this.plank, loads, dt);
    if (out.jolt !== 0) event = true;
    if (event) {
      for (const s of this.stats.values()) s.loadEvent(now);
      for (const bot of this.bots) botLoadEvent(bot, now, this.rand);
    }
    const phi = this.plank.phi;

    // 봇의 걷기 명령 — 길이 방향만. 기록은 사람과 같은 길로(월드 z)
    const botWalk = new Map<string, number>();
    for (const bot of this.bots) {
      const others = loads.filter((l) => l.id !== bot.body.id);
      const w = stepBot(bot, phi, this.plank.omega, others, now, dt, this.rand);
      botWalk.set(bot.body.id, w.wu);
      bot.body.running = w.running;
      bot.body.wx = 0;
      bot.body.wz = w.wu;
      bot.body.wAt = now;
      this.stats.get(bot.body.id)?.walk(0, w.wu, now);
    }

    for (const b of this.bodies.values()) {
      const st = this.stats.get(b.id);
      if (!b.on) {
        if (now >= b.fallenUntil) respawn(b);
        continue;
      }
      let wu = botWalk.get(b.id);
      let wv = 0;
      if (wu === undefined) {
        // 사람 — 명령이 오래됐으면 손을 뗀 것이다. 길이 = 월드 z, 폭 = 월드 x
        const stale = now - b.wAt > SEESAW_WALK_STALE_MS;
        wu = stale ? 0 : b.wz;
        wv = stale ? 0 : b.wx;
      }
      const res = stepBody(b, wu, wv, phi, mu, dt, now, out.jolt);
      if (res.fell) {
        st?.fell(now);
        ctx.broadcast({ t: 'trial_fell', id: b.id });
      } else {
        st?.tick(b.u, phi, Math.abs(b.s), Math.hypot(res.wu, res.wv), dt, now, starts);
      }
    }

    if (now - this.lastSnapshot >= SEESAW_SNAPSHOT_MS) {
      this.lastSnapshot = now;
      ctx.broadcast({
        t: 'trial_seesaw',
        at: now,
        phi: round3(phi),
        omega: round3(this.plank.omega),
        players: [...this.bodies.values()].map((b) => {
          const wLen = Math.hypot(b.wx, b.wz);
          const moving = b.on && now - b.wAt <= SEESAW_WALK_STALE_MS && wLen > 0.05;
          // 몸이 보는 방향 — 걷는 쪽. 안 걸으면 판 길이 방향을 본다
          const h = moving ? Math.atan2(b.wx, b.wz) : 0;
          return { id: b.id, u: round2(b.on ? b.u : b.fu), v: round2(b.on ? b.v : b.fv), h: round2(h), m: moving ? (b.running ? 2 : 1) : 0, f: b.on ? 0 : 1, s: round2(b.s) };
        }),
        crates: this.crates.map((c) => ({ id: c.id, u: round2(c.u), v: round2(c.v), at: c.landAt })),
      });
    }
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
