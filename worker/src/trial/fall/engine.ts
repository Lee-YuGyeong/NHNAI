/**
 * 낙하 생존 엔진 — 1분 시간제. setInterval 로 물리 틱(50ms)을 돌리고 스냅샷(100ms)을 뿌린다. 끝나면 타이머를
 * **즉시** 지운다 — 대기 중인 타이머가 DO 를 깨워 두므로(과금), 깨어 있는 창을 판 길이로 꽉 묶는다. 판 사이의
 * 토론 시간은 지금과 똑같이 잠든다.
 *
 * **중력은 판 내내 FALL_GRAVITY 하나다.** 원래 20초마다 60%·140% 로 몰래 바뀌는 숨은 조건이었는데(phase.ts),
 * 60% 구간의 점프가 체공 1.5초를 넘겨 「점프가 아니라 날아가는 것 같다」가 됐다 (2026-09-05 사용자: "이거 아예
 * 없애줘. 중력은 그대로여야해") — 구간 변화를 걷어냈다(condition.ts).
 *
 * 판정 대상은 전부 서버가 계산한다: 물체의 위치(적분), 맞았는가(겹침), 얼마나 벗어났는가(착지 순간 거리).
 * 실제 사람의 **수평** 위치는 그 사람이 보내는 move(10Hz)로 안다 — 하늘 위치를 지어내는 건 room-do.ts 가 범위로,
 * 순간이동은 걷기 속도로 막는다(onMove).
 *
 * **높이(y)는 서버 것이다.** 예전에는 클라가 복도와 같은 고정 중력(GRAVITY=15)으로 제 몸을 띄웠고 판정은 y 를
 * 아예 안 봤다 — 점프가 장식이었다. 이제 클라는 `trial_jump`(눌렀다)만 올리고, 서버가 포물선을 적분해 스냅샷의
 * `air` 로 돌려준다 — 회전 원판이 걷기 명령만 받고 자리를 돌려주는 것과 같은 수법이다. 중력이 상수가 된 지금도
 * 이 구조는 유지한다: 판정이 y 를 보는 이상(sim.ts overlapsBody) y 를 만드는 쪽도 서버여야 한다(PLANNING §5.1).
 *
 * **이륙 속도는 홀의 눈금에서 이 판의 눈금으로 옮겨 쓴다** (FALL_JUMP_SCALE). 몸의 점프 속도(mp/bodies)는 홀의
 * 중력 15 에 맞춰 잡은 값인데(6.4 → 1.37m), 이 판의 중력은 9.8 이라 그대로 쓰면 2.1m 를 뛰었다 (2026-09-05
 * 사용자: "점프하면 엄청 높게 올라가는데 왜"). 같은 다리 힘이면 같은 높이여야 한다 — 속도에 √(9.8/15) 를
 * 곱하면 정점이 홀과 같다.
 */
import { jumpOf } from '../../../../src/world/mp/bodies';
import { FALL_ARENA, FALL_SNAPSHOT_MS, FALL_SPAWN_MS, FALL_TICK_MS, GRAVITY, JUMP_SPEED, TRIAL_GAME_MS, WALK_SPEED } from '../../../../src/world/mp/constants';
import type { TrialPlayerResult } from '../../../../src/world/mp/protocol';
import { FALL_GRAVITY } from '../condition';

/** 이륙 속도 배율 — 홀(중력 15)에서 잡은 몸의 점프를 이 판의 중력(FALL_GRAVITY) 눈금으로 (머리말) */
export const FALL_JUMP_SCALE = Math.sqrt(FALL_GRAVITY / GRAVITY);
import type { EngineContext, GameEngine, SeatTuning } from '../engine';
import { phaseStarts } from '../phase';
import type { TrialCondition } from '../types';
import { makeDodgeProfile, makeDodger, stepDodger, type DodgeProfile, type Dodger } from './npc';
import { LINGER_MS, THREAT_R, clampToArena, horizontalDist, overlapsBody, spawnObject, stepObject, timeToGround, type FallObject } from './sim';
import { DodgeStats } from './stats';

/** 사람이 순간이동했다고 볼 속도 — 걷기의 2배. 그보다 빠른 move 는 버린다 (서버는 범위만 봤다, room-do.ts) */
const MAX_SPEED = WALK_SPEED * 2;
/**
 * 낙하물 열에 여덟 하고 반은 참가자를 겨냥한다 — sim.ts spawnObject 주석.
 * 일곱이었다 (2026-09-05 사용자: "공 난이도도 높여줘") — 마당이 12×19m 라 안 겨냥한 공은 대개
 * 아무 일 없이 빈 바닥에 떨어진다. 겨냥 비율이 곧 **사람이 실제로 피해야 하는 공의 수**다.
 */
const AIM_RATIO = 0.85;

/** 공중에 뜬 몸 — 발 높이와 수직 속도. 서버가 적분한다 (높이는 판정 대상이다, 머리말) */
interface Air {
  y: number;
  vy: number;
  /** 이 몸의 점프 초기 속도 — 무거운 몸은 낮게 뛴다 (mp/bodies.ts) */
  v0: number;
  /** 이번 점프가 시작된 시각 */
  since: number;
  jumps: number;
  /** 점프마다의 체공(ms) — 기록으로 남긴다 */
  airMs: number[];
}

export class FallEngine implements GameEngine {
  readonly game = 'fall' as const;
  readonly durationMs = TRIAL_GAME_MS;

  private ctx: EngineContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
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
  /** 몸의 높이 — 사람도 봇도 여기 하나로 적분한다 */
  private air = new Map<string, Air>();

  condition(): TrialCondition {
    // 상수 하나 — 구간 변화를 걷어냈다(condition.ts). 기록 모양(배열)은 다른 게임과 맞춘다
    return { gravity: [FALL_GRAVITY] };
  }

  start(_round: number, realIds: readonly string[], aiIds: readonly string[], ctx: EngineContext, tuning?: Record<string, SeatTuning>): void {
    this.stop();
    this.ctx = ctx;
    const now = Date.now();
    this.startedAt = now;
    this.endedAt = 0;
    this.lastTick = now;
    this.lastSpawn = now;
    this.lastSnapshot = now;
    this.objects = [];
    this.stats = new Map();
    this.air = new Map();

    // 사람은 마당 가운데 근처에서 시작한다고 본다 — 첫 move 가 오면 바로 덮인다
    for (const id of realIds) {
      this.stats.set(id, new DodgeStats(0, 0, now));
      this.air.set(id, this.freshAir(id));
    }

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
      this.air.set(id, this.freshAir(id));
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
    if (!this.air.has(id)) this.air.set(id, this.freshAir(id));
  }

  /** Space — 땅에 있을 때만 뜬다. 포물선은 서버가 적분한다 — 높이가 판정 대상이라서다(머리말) */
  onJump(id: string, now: number): void {
    if (!this.ctx) return;
    this.join(id);
    this.jump(id, now);
  }

  /** 땅에 선 몸 — 이륙 속도는 그 몸의 것을 이 판의 눈금으로 옮긴 값 (FALL_JUMP_SCALE) */
  private freshAir(id: string): Air {
    return { y: 0, vy: 0, v0: jumpOf(this.ctx?.bodyOf?.(id), JUMP_SPEED) * FALL_JUMP_SCALE, since: 0, jumps: 0, airMs: [] };
  }

  private jump(id: string, now: number): void {
    const a = this.air.get(id);
    if (!a || a.y > 0.001 || a.vy > 0) return;
    a.vy = a.v0;
    a.since = now;
    a.jumps += 1;
  }

  /** 지금 이 몸의 발 높이 — 피격 판정이 본다 */
  private feetY(id: string): number {
    return this.air.get(id)?.y ?? 0;
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
    return [...this.stats].map(([id, s]) => {
      const r = s.result(id, phaseStarts(this.startedAt), this.startedAt, end);
      const a = this.air.get(id);
      // 점프 수와 평균 체공 — 안 뛴 사람은 값이 없다(NaN)
      r.metrics.jumps = a?.jumps ?? 0;
      r.metrics.meanAirMs = a && a.airMs.length ? a.airMs.reduce((x, v) => x + v, 0) / a.airMs.length : Number.NaN;
      return r;
    });
  }

  /** "그 자리로 지금 떨어지는 게 있는가" — 2.5초 안에 닿을 물체가 위협 반경 안에 */
  private threatened(px: number, pz: number): boolean {
    for (const o of this.objects) {
      if (o.landedAt !== null) continue;
      if (horizontalDist(o.x, o.z, px, pz) < THREAT_R && timeToGround(o, FALL_GRAVITY) < 2.5) return true;
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
    // 스폰 — 열에 일곱은 참가자 하나를 겨냥해, 나머지는 아무 데나. 새 물체가 누구 머리 위인지 그 순간 기록한다(위협)
    if (now - this.lastSpawn >= FALL_SPAWN_MS) {
      this.lastSpawn = now;
      const targets = [...this.stats.values()].filter((s) => s.seen);
      const target = targets.length && Math.random() < AIM_RATIO ? targets[Math.floor(Math.random() * targets.length)] : null;
      const o = spawnObject(this.nextObjectId++, now, Math.random, target ? { x: target.x, z: target.z } : undefined);
      this.objects.push(o);
      for (const s of this.stats.values()) s.registerThreat(o);
    }

    // 몸의 높이 — 서버가 적분한다. 사람도 봇도 같은 식이다
    for (const a of this.air.values()) {
      if (a.y <= 0 && a.vy <= 0) continue;
      a.vy -= FALL_GRAVITY * dt;
      a.y += a.vy * dt;
      if (a.y <= 0 && a.vy < 0) {
        a.y = 0;
        a.vy = 0;
        if (a.since) a.airMs.push(now - a.since);
        a.since = 0;
      }
    }

    // 물체 적분 · 착지 · 피격
    for (const o of this.objects) {
      const wasAirborne = o.landedAt === null;
      stepObject(o, FALL_GRAVITY, dt, now);
      if (wasAirborne) {
        for (const [id, s] of this.stats) {
          if (s.seen && overlapsBody(o, s.x, s.z, this.feetY(id)) && s.onHit(o, now)) ctx.broadcast({ t: 'trial_hit', id, objectId: o.id });
        }
        if (o.landedAt !== null) for (const s of this.stats.values()) s.onLanded(o, now);
      }
    }
    this.objects = this.objects.filter((o) => o.landedAt === null || now - o.landedAt < LINGER_MS);

    // AI 회피 — 사람과 같은 걷기 속도로, 같은 sample() 로 센다. 놀라서 뛰는 것도 사람과 같은 통로다(P9)
    for (const d of this.dodgers) {
      stepDodger(d, this.objects, FALL_GRAVITY, now, dt);
      if (Math.random() < d.profile.jumpPerSec * dt) this.jump(d.id, now);
      this.stats.get(d.id)?.sample(d.x, d.z, now, (px, pz) => this.threatened(px, pz));
    }
    for (const s of this.stats.values()) s.settle(now);

    if (now - this.lastSnapshot >= FALL_SNAPSHOT_MS) {
      this.lastSnapshot = now;
      ctx.broadcast({
        t: 'trial_snapshot',
        at: now,
        objects: this.objects.map((o) => ({ id: o.id, k: o.kind, x: round2(o.x), y: round2(o.y), z: round2(o.z) })),
        ai: this.dodgers.map((d) => ({ id: d.id, x: round2(d.x), z: round2(d.z), y: round2(this.feetY(d.id)) })),
        // 뜬 몸만 싣는다 — 땅에 선 사람은 0 이라 보낼 게 없다. 와이어에는 결과(높이)만 나간다
        air: [...this.air].filter(([, a]) => a.y > 0.001 || a.vy > 0).map(([id, a]) => ({ id, y: round2(a.y) })),
      });
    }
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
