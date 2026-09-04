/**
 * 움직이는 플랫폼 엔진 — 1분 시간제 (낙하 생존과 같은 틀). 발판의 자리는 mp/platform.ts 의 함수로 시각마다 계산하고,
 * 사람의 점프·착지는 그 사람이 보내는 move(10Hz, x·z·y)에서 읽는다 — 발판이 그 시각에 어디 있었는지는 서버가 안다.
 * 봇은 npc.ts 가 틱마다 움직이고 같은 JumpStats 로 센다. 스냅샷(100ms)은 봇의 자리(y 포함)만 실린다 — 발판은 안 보낸다.
 *
 * 숨기는 값은 없다 — 발판 배속(pace)은 라운드 시작에 공개로 나간다(눈에 보이는 것). 기록의 condition 에는 배속표를 적는다.
 */
import { FALL_SNAPSHOT_MS, FALL_TICK_MS, TRIAL_GAME_MS } from '../../../../src/world/mp/constants';
import type { TrialPlayerResult } from '../../../../src/world/mp/protocol';
import { PAD_START_Z, PLATFORM_ARENA, PLATFORM_PACE, PLATFORM_PHASE_SPEED, padAt } from '../../../../src/world/mp/platform';
import type { EngineContext, GameEngine, SeatTuning } from '../engine';
import { phaseStarts } from '../phase';
import type { TrialCondition } from '../types';
import { makeJumpProfile, makeJumper, stepJumper, type JumpProfile, type Jumper } from './npc';
import { JumpStats } from './stats';

/** 강도(1~3) → 배속. 범위 밖이면 기준 */
export function paceForIntensity(intensity: number): number {
  return PLATFORM_PACE[Math.min(PLATFORM_PACE.length, Math.max(1, Math.round(intensity))) - 1] ?? 1;
}

export class PlatformEngine implements GameEngine {
  readonly game = 'platform' as const;
  readonly durationMs = TRIAL_GAME_MS;

  private ctx: EngineContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pace = 1;
  private startedAt = 0;
  private endedAt = 0;
  private lastTick = 0;
  private lastSnapshot = 0;
  private stats = new Map<string, JumpStats>();
  private jumpers: Jumper[] = [];
  private profiles = new Map<string, JumpProfile>();

  paceFor(intensity: number): number {
    return paceForIntensity(intensity);
  }

  condition(): TrialCondition {
    return { platformPace: PLATFORM_PHASE_SPEED.map((s) => s * this.pace) };
  }

  start(intensity: number, realIds: readonly string[], aiIds: readonly string[], ctx: EngineContext, tuning?: Record<string, SeatTuning>): void {
    this.stop();
    this.ctx = ctx;
    this.pace = paceForIntensity(intensity);
    const now = Date.now();
    this.startedAt = now;
    this.endedAt = 0;
    this.lastTick = now;
    this.lastSnapshot = now;
    this.stats = new Map();
    for (const id of realIds) this.stats.set(id, new JumpStats(now, this.pace));

    this.jumpers = aiIds.map((id, i) => {
      const t = tuning?.[id];
      let profile = this.profiles.get(id);
      if (t || !profile) {
        profile = makeJumpProfile(i, t?.precision);
        this.profiles.set(id, profile);
      }
      // 출발 발판 위에 나란히 — 사람도 같은 발판에서 시작한다 (클라가 라운드 시작에 옮긴다)
      const x = -0.6 + (i % 4) * 0.4;
      const st = new JumpStats(now, this.pace);
      this.stats.set(id, st);
      const j = makeJumper(id, x, PAD_START_Z, profile, now);
      st.sample(j.x, j.z, j.y, now);
      return j;
    });

    this.timer = setInterval(() => this.tick(), FALL_TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  join(id: string): void {
    if (!this.stats.has(id)) this.stats.set(id, new JumpStats(this.startedAt || Date.now(), this.pace));
  }

  onAccel(): void {
    /* 플랫폼은 W/S 시행이 없다 — 점프는 move 의 y 로 읽는다 */
  }

  onBrake(): void {
    /* 위와 같다 */
  }

  onPick(): void {
    /* 줍기도 없다 */
  }

  onWalk(): void {
    /* 회전 원판(disc)의 키 — 여기는 없다 */
  }

  onMove(id: string, x: number, z: number, now: number, y = 0): void {
    if (!this.ctx) return;
    this.join(id);
    const cx = Math.min(PLATFORM_ARENA.maxX, Math.max(PLATFORM_ARENA.minX, x));
    const cz = Math.min(PLATFORM_ARENA.maxZ, Math.max(PLATFORM_ARENA.minZ, z));
    this.stats.get(id)!.sample(cx, cz, y, now, (e) => this.ctx?.broadcast({ t: 'trial_landed', id, pad: e.pad, center: e.center, missed: e.missed }));
  }

  done(): boolean {
    return this.endedAt !== 0;
  }

  results(): TrialPlayerResult[] {
    return [...this.stats].map(([id, s]) => s.result(id, phaseStarts(this.startedAt)));
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;

    if (now - this.startedAt >= TRIAL_GAME_MS) {
      this.endedAt = now;
      this.stop();
      ctx.finish();
      return;
    }

    for (const j of this.jumpers) {
      stepJumper(j, now, dt, this.startedAt, this.pace);
      this.stats.get(j.id)?.sample(j.x, j.z, j.y, now, (e) => ctx.broadcast({ t: 'trial_landed', id: j.id, pad: e.pad, center: e.center, missed: e.missed }));
    }
    for (const s of this.stats.values()) s.settle(now);

    if (now - this.lastSnapshot >= FALL_SNAPSHOT_MS) {
      this.lastSnapshot = now;
      ctx.broadcast({
        t: 'trial_snapshot',
        at: now,
        objects: [],
        ai: this.jumpers.map((j) => ({ id: j.id, x: round2(j.x), z: round2(j.z), y: round2(j.y) })),
      });
    }
  }
}

/** 출발 발판의 z — 클라가 라운드 시작에 사람을 옮길 자리 (padAt 을 통해 같은 표를 읽는다) */
export const PLATFORM_START = { x: 0, z: padAt(0, 0, 1).z } as const;

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
