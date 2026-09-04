/**
 * 회전 원판 생존 엔진 — 1분 시간제. 낙하 생존(fall/engine.ts)과 같은 짜임: setInterval 로 물리 틱(50ms)을 돌리고 스냅샷(100ms)을
 * 뿌리며, 20초마다 표면 마찰이 몰래 바뀐다(phase.ts + condition.ts DISC_GRIP). 끝나면 타이머를 즉시 지운다.
 *
 * 낙하 생존과 다른 점 하나: **사람의 자리도 서버가 적분한다.** 원판이 사람을 실어 나르고 미끄러뜨리는데 그 미끄러짐이 숨은 μ 에서
 * 나오므로, 클라가 자리를 신고하게 두면 μ 를 모르는 클라가 지어내거나(틀리거나) 아는 클라가 속이거나 둘 중 하나다. 그래서 클라는
 * 걷기 명령(trial_walk, 월드 기준 속도)만 올리고, 자리는 스냅샷(trial_disc)으로 돌려받는다. move 메시지는 이 게임에서 무시한다.
 */
import { DISC_CENTER, DISC_SNAPSHOT_MS, DISC_TICK_MS, DISC_WALK_SPEED, DISC_WALK_STALE_MS, TRIAL_GAME_MS } from '../../../../src/world/mp/constants';
import type { TrialPlayerResult } from '../../../../src/world/mp/protocol';
import { DISC_GRIP } from '../condition';
import type { EngineContext, GameEngine, SeatTuning } from '../engine';
import { phaseAt, phaseStarts } from '../phase';
import type { TrialCondition } from '../types';
import { botSpinEvent, makeDiscBot, makeDiscProfile, stepBot, type DiscBot, type DiscProfile } from './npc';
import { clampWalk, gripForPhase, makeBody, makeSpin, respawn, rot, stepBody, stepSpin, worldOf, type DiscBody, type Spin } from './sim';
import { DiscStats } from './stats';

export class DiscEngine implements GameEngine {
  readonly game = 'disc' as const;
  readonly durationMs = TRIAL_GAME_MS;

  private ctx: EngineContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private endedAt = 0;
  private lastTick = 0;
  private lastSnapshot = 0;
  private spin: Spin = makeSpin(0, () => 0.5);
  private bodies = new Map<string, DiscBody>();
  private stats = new Map<string, DiscStats>();
  private bots: DiscBot[] = [];
  private profiles = new Map<string, DiscProfile>();
  /** 지난 틱에 몸마다 필요했던 마찰 — 봇이 읽는다 */
  private need = new Map<string, number>();
  private readonly rand: () => number;

  constructor(rand: () => number = Math.random) {
    this.rand = rand;
  }

  condition(): TrialCondition {
    return { grip: DISC_GRIP };
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
    this.need = new Map();

    // 전원이 기둥 둘레 고리(DISC_RESPAWN_R)에 같은 간격으로 선다 — 출발 자리로 유불리가 없게
    const all = [...realIds, ...aiIds];
    all.forEach((id, i) => this.place(id, (i / Math.max(1, all.length)) * Math.PI * 2));

    this.bots = aiIds.map((id, i) => {
      const t = tuning?.[id];
      let profile = this.profiles.get(id);
      if (t || !profile) {
        profile = makeDiscProfile(i, t?.precision, this.rand);
        this.profiles.set(id, profile);
      }
      return makeDiscBot(this.bodies.get(id)!, profile);
    });

    this.timer = setInterval(() => this.tick(), DISC_TICK_MS);
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
    this.bodies.set(id, makeBody(id, angle));
    this.stats.set(id, new DiscStats());
  }

  onAccel(): void {
    /* 원판은 W/S 시행이 없다 */
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
    const w = clampWalk(x, z);
    b.wx = w.x;
    b.wz = w.z;
    b.running = Math.hypot(w.x, w.z) > DISC_WALK_SPEED + 0.1;
    b.wAt = now;
    this.stats.get(id)?.walk(w.x, w.z, now);
  }

  done(): boolean {
    return this.endedAt !== 0;
  }

  results(): TrialPlayerResult[] {
    return [...this.stats].map(([id, s]) => s.result(id));
  }

  /** 시험용 — 지금 원판 상태 */
  spinState(): Readonly<Spin> {
    return this.spin;
  }

  bodyOf(id: string): DiscBody | undefined {
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
    const mu = gripForPhase(phaseAt(now - this.startedAt));
    const starts = phaseStarts(this.startedAt);

    // 회전 — 목표가 새로 뽑히면 「사건」이다: 기록은 반응을 재기 시작하고, 사람 같은 봇은 놀란다
    const { alpha, changed } = stepSpin(this.spin, now, dt, this.rand);
    if (Math.abs(changed) >= 0.4) {
      for (const s of this.stats.values()) s.spinEvent(now);
      for (const bot of this.bots) botSpinEvent(bot, now, this.rand);
    }
    const omega = this.spin.omega;
    const theta = this.spin.theta;

    // 봇의 걷기 명령 — 원판 좌표로 바로 준다 (사람은 월드 좌표를 아래에서 돌린다)
    const botWalk = new Map<string, { x: number; z: number }>();
    for (const bot of this.bots) {
      const out = stepBot(bot, omega, this.need.get(bot.body.id) ?? 0, now, dt, this.rand);
      botWalk.set(bot.body.id, out.w);
      bot.body.running = out.running;
      // 기록은 사람과 같은 길로 — 원판 좌표 명령을 월드로 돌려서 「명령이 바뀌었나」를 같은 문턱으로 본다
      const ww = rot(theta, out.w);
      bot.body.wx = ww.x;
      bot.body.wz = ww.z;
      bot.body.wAt = now;
      this.stats.get(bot.body.id)?.walk(ww.x, ww.z, now);
    }

    for (const b of this.bodies.values()) {
      const st = this.stats.get(b.id);
      if (!b.on) {
        if (now >= b.fallenUntil) respawn(b);
        continue;
      }
      let wDisc = botWalk.get(b.id);
      if (!wDisc) {
        // 사람 — 명령이 오래됐으면 손을 뗀 것이다
        const stale = now - b.wAt > DISC_WALK_STALE_MS;
        wDisc = stale ? { x: 0, z: 0 } : rot(-theta, { x: b.wx, z: b.wz });
      }
      const out = stepBody(b, wDisc, omega, alpha, mu, dt, now);
      this.need.set(b.id, out.need);
      if (out.fell) {
        // 떨어진 자리 = 원판 가장자리 바로 바깥의 월드 자리
        const w = rot(theta, { x: b.px, z: b.pz });
        b.fx = DISC_CENTER.x + w.x;
        b.fz = DISC_CENTER.z + w.z;
        st?.fell();
        ctx.broadcast({ t: 'trial_fell', id: b.id });
      } else {
        st?.tick(Math.hypot(b.px, b.pz), Math.hypot(b.sx, b.sz), Math.hypot(out.wx, out.wz), dt, now, starts);
      }
    }

    if (now - this.lastSnapshot >= DISC_SNAPSHOT_MS) {
      this.lastSnapshot = now;
      ctx.broadcast({
        t: 'trial_disc',
        at: now,
        theta: round3(theta),
        omega: round3(omega),
        players: [...this.bodies.values()].map((b) => {
          const p = worldOf(b, theta, DISC_CENTER);
          const wLen = Math.hypot(b.wx, b.wz);
          const moving = b.on && now - b.wAt <= DISC_WALK_STALE_MS && wLen > 0.05;
          // 몸이 보는 방향 — 걷는 쪽. 안 걸으면 원판이 실어 나르는 방향(접선)
          const t = rot(theta, { x: b.pz * omega, z: -b.px * omega });
          const h = moving ? Math.atan2(b.wx, b.wz) : Math.abs(omega) > 0.05 ? Math.atan2(t.x, t.z) : 0;
          // 미끄러짐은 월드 좌표로 — 클라의 예측이 월드에서 돈다
          const s = rot(theta, { x: b.sx, z: b.sz });
          return { id: b.id, x: round2(p.x), z: round2(p.z), y: round2(p.y), h: round2(h), m: moving ? (b.running ? 2 : 1) : 0, f: b.on ? 0 : 1, sx: round2(s.x), sz: round2(s.z) };
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
