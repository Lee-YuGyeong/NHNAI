/**
 * 회전 봉 넘기 엔진 — 1분 시간제. 회전 원판(disc/engine.ts)과 같은 짜임: setInterval 로 물리 틱(50ms)을 돌리고
 * 스냅샷(100ms)을 뿌리며, 20초마다 무대 바닥의 마찰이 몰래 바뀐다(phase.ts + condition.ts BAR_GRIP). 봉의 속도는
 * 원판처럼 불규칙하다 — 빨라졌다 느려졌다 방향도 뒤집힌다(sim.ts Spin). 그쪽은 **공개**다(θ·ω 가 스냅샷에 그대로 실린다).
 *
 * 사람의 자리도, 점프의 포물선도 서버가 적분한다: 발밑 마찰이 숨은 값이라 자리를 클라에 맡길 수 없고(disc 와 같은 이유),
 * 스침 판정이 발 높이를 보는 이상 높이를 만드는 쪽도 서버여야 한다(fall/engine.ts 와 같은 이유). 클라는 걷기 명령
 * (trial_walk)과 「뛰었다」(trial_jump)만 올리고, 자리·높이는 스냅샷(trial_bar)으로 돌려받는다. move 는 무시한다.
 *
 * 몸: 무거운 몸은 같은 바닥에서 마찰 배율(mp/bodies.ts grip)만큼 덜 잡고, 낮게 뛰어(jump) 체공 창이 좁고, 달리기 상한도
 * 그 몸의 것이다. 몸은 ctx.bodyOf 로 묻는다 — 모르면 기준.
 */
import { gripOf, jumpOf, runCapOf } from '../../../../src/world/mp/bodies';
import {
  BAR_CENTER,
  BAR_DOWN_MS,
  BAR_HEIGHT,
  BAR_JUMP_K,
  BAR_JUMP_SCALE,
  BAR_RUN_SPEED,
  BAR_SHOVE,
  BAR_SNAPSHOT_MS,
  BAR_STAND_R,
  BAR_TICK_MS,
  BAR_TOP,
  BAR_WALK_SPEED,
  BAR_WALK_STALE_MS,
  JUMP_SPEED,
  TRIAL_GAME_MS,
} from '../../../../src/world/mp/constants';
import type { TrialPlayerResult } from '../../../../src/world/mp/protocol';
import { BAR_GRIP } from '../condition';
import type { EngineContext, GameEngine, SeatTuning } from '../engine';
import { phaseAt, phaseStarts } from '../phase';
import type { TrialCondition } from '../types';
import { botOmegaEvent, makeBarBot, makeBarProfile, stepBarBot, type BarBot, type BarProfile } from './npc';
import { G, clampWalk, crossed, gripForPhase, jump, knockDown, makeBarBody, makeSpin, relOf, respawn, stepBarBody, stepSpin, timeToCross, type BarBody, type Spin } from './sim';
import { BarStats, ERR_CAP } from './stats';

/** 봉이 이보다 느리면 스침으로 안 친다 — 첫 램프의 반 발짝과 「거의 멈춘 봉에 닿았다」를 거른다 */
const SWEEP_MIN_OMEGA = 0.15;
/** 뛴 순간 봉이 이보다 멀면(초) 헛점프다 — 기록에만 남는다 */
const UNNECESSARY_S = 2.0;

export class BarEngine implements GameEngine {
  readonly game = 'bar' as const;
  readonly durationMs = TRIAL_GAME_MS;

  private ctx: EngineContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private endedAt = 0;
  private lastTick = 0;
  private lastSnapshot = 0;
  private spin: Spin = makeSpin(0, () => 0.5);
  private bodies = new Map<string, BarBody>();
  private stats = new Map<string, BarStats>();
  private bots: BarBot[] = [];
  private profiles = new Map<string, BarProfile>();
  private readonly rand: () => number;

  constructor(rand: () => number = Math.random) {
    this.rand = rand;
  }

  condition(): TrialCondition {
    return { barGrip: BAR_GRIP };
  }

  start(_round: number, realIds: readonly string[], aiIds: readonly string[], ctx: EngineContext, tuning?: Record<string, SeatTuning>): void {
    this.stop();
    this.ctx = ctx;
    const now = Date.now();
    this.startedAt = now;
    this.endedAt = 0;
    this.lastTick = now;
    this.lastSnapshot = now;
    this.spin = makeSpin(now, this.rand);
    this.bodies = new Map();
    this.stats = new Map();

    // 전원이 같은 고리(BAR_STAND_R)에 같은 간격으로 선다 — 봉의 출발 각도에서 한 발 물려(−1.2rad) 첫 스침까지 숨 쉴 틈을 준다
    const all = [...realIds, ...aiIds];
    all.forEach((id, i) => this.place(id, -1.2 - (i / Math.max(1, all.length)) * Math.PI * 2));

    this.bots = aiIds.map((id, i) => {
      const t = tuning?.[id];
      let profile = this.profiles.get(id);
      if (t || !profile) {
        profile = makeBarProfile(i, t?.precision, this.rand);
        this.profiles.set(id, profile);
      }
      return makeBarBot(this.bodies.get(id)!, profile, this.rand);
    });

    this.timer = setInterval(() => this.tick(), BAR_TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  join(id: string): void {
    if (!this.bodies.has(id)) this.place(id, this.rand() * Math.PI * 2);
  }

  private place(id: string, angle: number): void {
    // 이륙 속도는 그 몸의 것을 이 판의 눈금으로 (fall/engine.ts freshAir 와 같은 수법) — 이 판만 낮게 뛴다 (BAR_JUMP_K)
    const v0 = jumpOf(this.ctx?.bodyOf?.(id), JUMP_SPEED) * BAR_JUMP_SCALE * BAR_JUMP_K;
    this.bodies.set(id, makeBarBody(id, angle, v0, BAR_STAND_R));
    this.stats.set(id, new BarStats());
  }

  onAccel(): void {
    /* 봉 넘기는 W/S 시행이 없다 */
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

  /** 걷기 명령(월드 기준, m/s). 상한으로 자르고 시각을 적는다 */
  onWalk(id: string, x: number, z: number, now: number): void {
    this.join(id);
    const b = this.bodies.get(id)!;
    const w = clampWalk(x, z, runCapOf(this.ctx?.bodyOf?.(id), BAR_RUN_SPEED));
    b.wx = w.x;
    b.wz = w.z;
    b.running = Math.hypot(w.x, w.z) > BAR_WALK_SPEED + 0.1;
    b.wAt = now;
  }

  /** Space — 사람도 봇도 이 통로 하나다(P9). 봉이 멀리 있는데 뛰었으면 헛점프로 센다 */
  onJump(id: string, now: number): void {
    if (!this.ctx) return;
    this.join(id);
    this.jumpFor(id, now);
  }

  private jumpFor(id: string, now: number): void {
    const b = this.bodies.get(id);
    if (!b || !jump(b, now)) return;
    const t = timeToCross(relOf(b, this.spin.theta), this.spin.omega);
    if (t > UNNECESSARY_S) this.stats.get(id)?.unnecessaryJump();
  }

  done(): boolean {
    return this.endedAt !== 0;
  }

  results(): TrialPlayerResult[] {
    // 마감을 판이 먼저 닫았으면 endedAt 이 0 이다 — 지금이 끝이다 (tower/engine.ts results 와 같다)
    const end = this.endedAt || Date.now();
    return [...this.stats].map(([id, s]) => {
      const r = s.result(id, this.startedAt, end);
      r.metrics.jumps = this.bodies.get(id)?.jumps ?? 0;
      return r;
    });
  }

  /** 시험용 — 지금 봉의 상태 */
  spinState(): Readonly<Spin> {
    return this.spin;
  }

  bodyOf(id: string): BarBody | undefined {
    return this.bodies.get(id);
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
    const phase = phaseAt(now - this.startedAt);
    const mu = gripForPhase(phase);
    const starts = phaseStarts(this.startedAt);

    // 봉의 회전 — 목표가 새로 뽑히면 「사건」이다: 사람 같은 봇은 옛 셈으로 한 박자 더 잰다 (disc 와 같은 문턱)
    const { changed } = stepSpin(this.spin, now, dt, this.rand);
    if (Math.abs(changed) >= 0.4) {
      for (const bot of this.bots) botOmegaEvent(bot, now, this.rand);
    }
    const theta = this.spin.theta;
    const omega = this.spin.omega;

    // 봇의 걷기 명령과 점프 — 점프는 사람과 같은 통로(jumpFor)다
    for (const bot of this.bots) {
      const out = stepBarBot(bot, theta, omega, now, dt, this.rand, (id) => this.jumpFor(id, now));
      bot.body.wx = out.w.x;
      bot.body.wz = out.w.z;
      bot.body.running = out.running;
      bot.body.wAt = now;
    }

    for (const b of this.bodies.values()) {
      const st = this.stats.get(b.id);
      if (!b.on) {
        if (now >= b.fallenUntil) respawn(b);
        continue;
      }
      if (b.down && now >= b.downUntil) b.down = false;
      // 사람 — 명령이 오래됐으면 손을 뗀 것이다 (봇은 매 틱 새로 적는다)
      if (now - b.wAt > BAR_WALK_STALE_MS) {
        b.wx = 0;
        b.wz = 0;
      }
      const out = stepBarBody(b, mu * gripOf(ctx.bodyOf?.(b.id)), dt, now);
      if (out.fell) {
        st?.fell(now);
        ctx.broadcast({ t: 'trial_fell', id: b.id });
        continue;
      }
      st?.tick(out.moved, out.slid);
      if (!b.down && Math.hypot(b.wx, b.wz) > 0.05) b.heading = Math.atan2(b.wx, b.wz);

      // 스침 — 봉이 이 몸의 각도를 지났나. 누운 몸은 봉이 위로 지나간다
      const rel = relOf(b, theta);
      if (!b.down && crossed(b.prevRel, rel) && Math.abs(omega) >= SWEEP_MIN_OMEGA) {
        if (b.y >= BAR_HEIGHT) {
          // 넘었다 — 오차는 「스침이 체공의 한가운데서 얼마나 벗어났나」. 수직축이 전부 공개라 이건 순수한 리듬이다
          const half = b.v0 / G;
          const tAir = b.jumpAt > 0 ? (now - b.jumpAt) / 1000 : half;
          const err = Math.min(ERR_CAP, Math.abs(tAir - half));
          st?.sweep(false, err, tAir > half ? 1 : -1, now, starts);
        } else {
          // 맞았다 — 늦었거나(안 뛰었다) 일렀다(이미 내려왔다). 봉이 쓸어 가는 쪽으로 밀려 넘어진다
          const half = b.v0 / G;
          const dir = b.jumpAt > 0 && (now - b.jumpAt) / 1000 > half ? 1 : -1;
          st?.sweep(true, ERR_CAP, dir, now, starts);
          knockDown(b, omega, BAR_SHOVE, BAR_DOWN_MS, now);
          ctx.broadcast({ t: 'trial_hit', id: b.id, objectId: 0 });
        }
      }
      b.prevRel = rel;
    }

    if (now - this.lastSnapshot >= BAR_SNAPSHOT_MS) {
      this.lastSnapshot = now;
      ctx.broadcast({
        t: 'trial_bar',
        at: now,
        theta: round3(theta),
        omega: round3(omega),
        players: [...this.bodies.values()].map((b) => {
          const x = BAR_CENTER.x + (b.on ? b.x : b.fx);
          const z = BAR_CENTER.z + (b.on ? b.z : b.fz);
          const wLen = Math.hypot(b.wx, b.wz);
          const moving = b.on && !b.down && wLen > 0.05;
          // 명령과 다른 몫 — 클라는 w + s 로 다음 스냅샷까지 제 몸을 예측한다 (BarRig). μ 는 안 나간다(P8)
          const sx = b.on ? b.vx - b.wx : 0;
          const sz = b.on ? b.vz - b.wz : 0;
          return {
            id: b.id,
            x: round2(x),
            z: round2(z),
            y: round2(b.on ? BAR_TOP + b.y : 0),
            h: round2(moving ? Math.atan2(b.wx, b.wz) : b.heading),
            m: moving ? (b.running ? 2 : 1) : 0,
            f: !b.on || b.down ? 1 : 0,
            sx: round2(sx),
            sz: round2(sz),
          };
        }),
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
