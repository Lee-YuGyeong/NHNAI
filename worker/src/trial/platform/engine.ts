/**
 * 움직이는 플랫폼 엔진 — 30초 시간제 (PLATFORM_GAME_MS, 틀은 낙하 생존과 같다). 발판의 자리는 mp/platform.ts 의 함수로 시각마다 계산하고,
 * 사람의 점프·착지는 그 사람이 보내는 move(10Hz, x·z·y)에서 읽는다 — 발판이 그 시각에 어디 있었는지는 서버가 안다.
 * 봇은 npc.ts 가 틱마다 움직이고 같은 JumpStats 로 센다. 스냅샷(100ms)은 봇의 자리(y 포함)만 실린다 — 발판은 안 보낸다.
 *
 * 숨기는 값은 **발판 윗면의 마찰**(condition.ts PLATFORM_GRIP) 하나다 — 착지한 발이 얼마나 밀리는가. 배속(pace)은
 * 눈에 보이는 것이라 라운드 시작에 공개로 나간다. μ 는 와이어에 안 실린다(P8): 서버가 착지 순간 곱셈을 끝낸
 * 미끄러짐(속도·지속 시간)만 `trial_slip` 으로 내려보낸다 — 색 사냥이 반사율 대신 표시색만 내려보내는 것과 같다.
 */
import { FALL_SNAPSHOT_MS, FALL_TICK_MS, PLATFORM_GAME_MS } from '../../../../src/world/mp/constants';
import type { TrialPlayerResult } from '../../../../src/world/mp/protocol';
import { PAD_START_Z, PLATFORM_ARENA, PLATFORM_PACE, PLATFORM_PHASE_SPEED, padAt } from '../../../../src/world/mp/platform';
import { PLATFORM_GRIP } from '../condition';
import type { EngineContext, GameEngine, SeatTuning } from '../engine';
import { phaseAt, phaseStarts } from '../phase';
import type { TrialCondition } from '../types';
import { makeJumpProfile, makeJumper, slipJumper, stepJumper, type JumpProfile, type Jumper } from './npc';
import { JumpStats } from './stats';

/** 강도(1~3) → 배속. 범위 밖이면 기준 */
export function paceForIntensity(intensity: number): number {
  return PLATFORM_PACE[Math.min(PLATFORM_PACE.length, Math.max(1, Math.round(intensity))) - 1] ?? 1;
}

export class PlatformEngine implements GameEngine {
  readonly game = 'platform' as const;
  readonly durationMs = PLATFORM_GAME_MS;

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
    return { platformPace: PLATFORM_PHASE_SPEED.map((s) => s * this.pace), platformGrip: PLATFORM_GRIP };
  }

  /** 그 시각 발판 윗면의 마찰 — 20초마다 몰래 바뀐다. 이 함수 밖으로는 결과(미끄러짐)만 나간다 */
  private muAt(now: number): number {
    return PLATFORM_GRIP[phaseAt(now - this.startedAt) - 1] ?? PLATFORM_GRIP[0];
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
    const mu = (t: number) => this.muAt(t);
    for (const id of realIds) this.stats.set(id, new JumpStats(now, this.pace, mu));

    this.jumpers = aiIds.map((id, i) => {
      const t = tuning?.[id];
      let profile = this.profiles.get(id);
      if (t || !profile) {
        profile = makeJumpProfile(i, t?.precision);
        this.profiles.set(id, profile);
      }
      // 출발 발판 위에 나란히 — 사람도 같은 발판에서 시작한다 (클라가 라운드 시작에 옮긴다)
      const x = -0.6 + (i % 4) * 0.4;
      const st = new JumpStats(now, this.pace, mu);
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
    if (!this.stats.has(id)) this.stats.set(id, new JumpStats(this.startedAt || Date.now(), this.pace, (t) => this.muAt(t)));
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
    this.stats.get(id)!.sample(cx, cz, y, now, (e) => {
      this.ctx?.broadcast({ t: 'trial_landed', id, pad: e.pad, center: e.center, missed: e.missed });
      // 미끄러짐은 곱셈이 끝난 결과만 — 클라가 제 몸을 그만큼 민다 (FreeRig · platformState)
      if (e.slip) this.ctx?.broadcast({ t: 'trial_slip', id, vx: round2(e.slip.vx), vz: round2(e.slip.vz), ms: Math.round(e.slip.ms) });
    });
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

    if (now - this.startedAt >= PLATFORM_GAME_MS) {
      this.endedAt = now;
      this.stop();
      ctx.finish();
      return;
    }

    for (const j of this.jumpers) {
      stepJumper(j, now, dt, this.startedAt, this.pace);
      // 봇도 같은 바닥을 밟는다 — 착지 미끄러짐을 그대로 몸에 물린다(P9). 안 그러면 「안 미끄러지는 좌석」이 곧 정답표다
      this.stats.get(j.id)?.sample(j.x, j.z, j.y, now, (e) => {
        ctx.broadcast({ t: 'trial_landed', id: j.id, pad: e.pad, center: e.center, missed: e.missed });
        if (e.slip) slipJumper(j, e.slip.vx, e.slip.vz, e.slip.ms, now);
      });
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
