/**
 * 낙하 생존 엔진 — 1분 시간제. setInterval 로 물리 틱(50ms)을 돌리고 스냅샷(100ms)을 뿌린다. 그 1분 안에서
 * 20초마다 중력이 몰래 바뀐다(phase.ts). 끝나면 타이머를 **즉시** 지운다 — 대기 중인 타이머가 DO 를 깨워
 * 두므로(과금), 깨어 있는 창을 판 길이로 꽉 묶는다. 판 사이의 토론 시간은 지금과 똑같이 잠든다.
 *
 * 판정 대상은 전부 서버가 계산한다: 물체의 위치(적분), 맞았는가(겹침), 얼마나 벗어났는가(착지 순간 거리).
 * 실제 사람의 위치는 그 사람이 보내는 move(10Hz)로 안다 — 하늘 위치를 지어내는 건 room-do.ts 가 범위로,
 * 순간이동은 걷기 속도로 막는다(onMove).
 */
import { FALL_ARENA, FALL_SNAPSHOT_MS, FALL_SPAWN_MS, FALL_TICK_MS, TRIAL_GAME_MS, WALK_SPEED } from '../../../../src/world/mp/constants';
import type { TrialPlayerResult } from '../../../../src/world/mp/protocol';
import { FALL_GRAVITY } from '../condition';
import type { EngineContext, GameEngine, SeatTuning } from '../engine';
import { phaseAt, phaseStarts } from '../phase';
import type { TrialCondition } from '../types';
import { makeDodgeProfile, makeDodger, stepDodger, type DodgeProfile, type Dodger } from './npc';
import { LINGER_MS, THREAT_R, clampToArena, gravityForPhase, horizontalDist, overlapsBody, spawnObject, stepObject, timeToGround, type FallObject } from './sim';
import { DodgeStats } from './stats';

/** 사람이 순간이동했다고 볼 속도 — 걷기의 2배. 그보다 빠른 move 는 버린다 (서버는 범위만 봤다, room-do.ts) */
const MAX_SPEED = WALK_SPEED * 2;
/** 낙하물 열에 일곱은 참가자를 겨냥한다 — sim.ts spawnObject 주석 */
const AIM_RATIO = 0.7;

export class FallEngine implements GameEngine {
  readonly game = 'fall' as const;
  readonly durationMs = TRIAL_GAME_MS;

  private ctx: EngineContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private gravity = gravityForPhase(1);
  private startedAt = 0;
  private endedAt = 0;
  private lastTick = 0;
  private lastSpawn = 0;
  private lastSnapshot = 0;
  private nextObjectId = 1;
  private objects: FallObject[] = [];
  private stats = new Map<string, DodgeStats>();
  private dodgers: Dodger[] = [];
  private profiles = new Map<string, DodgeProfile>();

  condition(): TrialCondition {
    return { gravity: FALL_GRAVITY };
  }

  start(_round: number, realIds: readonly string[], aiIds: readonly string[], ctx: EngineContext, tuning?: Record<string, SeatTuning>): void {
    this.stop();
    this.ctx = ctx;
    this.gravity = gravityForPhase(1);
    const now = Date.now();
    this.startedAt = now;
    this.endedAt = 0;
    this.lastTick = now;
    this.lastSpawn = now;
    this.lastSnapshot = now;
    this.objects = [];
    this.stats = new Map();

    // 사람은 마당 가운데 근처에서 시작한다고 본다 — 첫 move 가 오면 바로 덮인다
    for (const id of realIds) this.stats.set(id, new DodgeStats(0, 0, now));

    this.dodgers = aiIds.map((id, i) => {
      const t = tuning?.[id];
      let profile = this.profiles.get(id);
      // 전략(tuning)이 오면 라운드마다 새로 뽑는다 (P9). 없으면 첫 라운드에 뽑은 성격을 유지한다
      if (t || !profile) {
        profile = makeDodgeProfile(i, t?.precision);
        this.profiles.set(id, profile);
      }
      // AI 는 마당 안에 흩어져 선다
      const x = FALL_ARENA.minX + 1.5 + Math.random() * (FALL_ARENA.maxX - FALL_ARENA.minX - 3);
      const z = FALL_ARENA.minZ + 1.5 + Math.random() * (FALL_ARENA.maxZ - FALL_ARENA.minZ - 3);
      const st = new DodgeStats(x, z, now);
      st.seen = true; // AI 는 자리를 처음부터 안다
      this.stats.set(id, st);
      return makeDodger(id, x, z, profile);
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
    if (!this.stats.has(id)) this.stats.set(id, new DodgeStats(0, 0, Date.now()));
  }

  onAccel(): void {
    /* 낙하 생존은 W/S 시행이 없다 */
  }

  onBrake(): void {
    /* 위와 같다 */
  }

  onPick(): void {
    /* 낙하 생존은 줍기가 없다 — 색 사냥의 키다 */
  }

  onMove(id: string, x: number, z: number, now: number): void {
    if (!this.ctx) return;
    this.join(id);
    const s = this.stats.get(id)!;
    // 걷기 속도의 두 배를 넘는 이동은 순간이동이다 — 첫 샘플은 자리 표시에서 오는 것이라 예외
    const dt = Math.max(1, now - s.at) / 1000;
    if (s.seen && horizontalDist(x, z, s.x, s.z) / dt > MAX_SPEED) return;
    const c = clampToArena(x, z);
    s.sample(c.x, c.z, now, (px, pz) => this.threatened(px, pz));
  }

  done(): boolean {
    return this.endedAt !== 0;
  }

  results(): TrialPlayerResult[] {
    const end = this.endedAt || Date.now();
    return [...this.stats].map(([id, s]) => s.result(id, phaseStarts(this.startedAt), this.startedAt, end));
  }

  /** "그 자리로 지금 떨어지는 게 있는가" — 2.5초 안에 닿을 물체가 위협 반경 안에 */
  private threatened(px: number, pz: number): boolean {
    for (const o of this.objects) {
      if (o.landedAt !== null) continue;
      if (horizontalDist(o.x, o.z, px, pz) < THREAT_R && timeToGround(o, this.gravity) < 2.5) return true;
    }
    return false;
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
    // 20초마다 중력이 바뀐다 — 알리지 않는다. 사람은 공이 닿는 박자가 달라진 걸 몸으로 알아채야 한다
    this.gravity = gravityForPhase(phaseAt(now - this.startedAt));

    // 스폰 — 열에 일곱은 참가자 하나를 겨냥해, 나머지는 아무 데나. 새 물체가 누구 머리 위인지 그 순간 기록한다(위협)
    if (now - this.lastSpawn >= FALL_SPAWN_MS) {
      this.lastSpawn = now;
      const targets = [...this.stats.values()].filter((s) => s.seen);
      const target = targets.length && Math.random() < AIM_RATIO ? targets[Math.floor(Math.random() * targets.length)] : null;
      const o = spawnObject(this.nextObjectId++, now, Math.random, target ? { x: target.x, z: target.z } : undefined);
      this.objects.push(o);
      for (const s of this.stats.values()) s.registerThreat(o);
    }

    // 물체 적분 · 착지 · 피격
    for (const o of this.objects) {
      const wasAirborne = o.landedAt === null;
      stepObject(o, this.gravity, dt, now);
      if (wasAirborne) {
        for (const [id, s] of this.stats) {
          if (s.seen && overlapsBody(o, s.x, s.z) && s.onHit(o, now)) ctx.broadcast({ t: 'trial_hit', id, objectId: o.id });
        }
        if (o.landedAt !== null) for (const s of this.stats.values()) s.onLanded(o, now);
      }
    }
    this.objects = this.objects.filter((o) => o.landedAt === null || now - o.landedAt < LINGER_MS);

    // AI 회피 — 사람과 같은 걷기 속도로, 같은 sample() 로 센다
    for (const d of this.dodgers) {
      stepDodger(d, this.objects, this.gravity, now, dt);
      this.stats.get(d.id)?.sample(d.x, d.z, now, (px, pz) => this.threatened(px, pz));
    }
    for (const s of this.stats.values()) s.settle(now);

    if (now - this.lastSnapshot >= FALL_SNAPSHOT_MS) {
      this.lastSnapshot = now;
      ctx.broadcast({
        t: 'trial_snapshot',
        at: now,
        objects: this.objects.map((o) => ({ id: o.id, k: o.kind, x: round2(o.x), y: round2(o.y), z: round2(o.z) })),
        ai: this.dodgers.map((d) => ({ id: d.id, x: round2(d.x), z: round2(d.z) })),
      });
    }
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
