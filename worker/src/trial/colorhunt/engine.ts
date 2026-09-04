/**
 * 색 사냥 엔진 — 1분 시간제, 물리 시뮬레이션 없음(이벤트 대조). 그 1분 안에서 20초마다 조명이
 * 바뀐다(COLORHUNT_BLOCK: 기준광 → 적색 차단 → 녹색 차단). 서버가 구슬의 진짜 색(팔레트)과
 * 조명 곱셈을 전부 쥐고, 클라이언트에는 표시색만 내려보낸다 (P8, docs/COLORHUNT.md).
 *
 *   · 시작·전환마다 trial_colorhunt(전체 동기화 — 구슬·견본판·목표색), 그 사이는 trial_picked /
 *     trial_orb(리스폰)로 증분만 나간다. AI 좌석의 걸음은 trial_snapshot(ai)으로 — 낙하 생존과 같은 통로다.
 *   · 줍기 판정: 거리 · 쿨다운 · 구슬 존재 → 정오는 그 순간의 목표색과 대조. **정오는 아무에게도
 *     실시간으로 안 알린다** — 본인 피드백을 주면 두어 개 주워 보고 조명을 역산할 수 있다 (§6).
 *   · start() 의 첫 인자는 라운드가 아니라 **강도**다 — 판(GameRuntime)은 관리 AI 의 intensity 를,
 *     /trial 은 1을 넣는다. 목표색 난이도(§4)가 여기서 갈린다. 조명 순서는 안 바뀐다.
 */
import {
  FALL_SNAPSHOT_MS,
  HUNT_ARENA,
  HUNT_ORBS_PER_HUE,
  HUNT_PICK_COOLDOWN_MS,
  HUNT_PICK_R,
  HUNT_RESPAWN_JITTER,
  HUNT_RESPAWN_MS,
  TRIAL_GAME_MS,
  WALK_SPEED,
} from '../../../../src/world/mp/constants';
import type { ColorOrb, TrialPlayerResult } from '../../../../src/world/mp/protocol';
import { COLORHUNT_BLOCK } from '../condition';
import type { EngineContext, GameEngine, SeatTuning } from '../engine';
import { phaseAt } from '../phase';
import type { TrialCondition } from '../types';
import { HUNT_HUES, confusableWith, deadHue, hueOf, lightHex, lightOf, pickTargets, shownHex, type HuntHueKey } from './palette';
import { makeHunter, makeHuntProfile, hunterOnSwitch, stepHunter, type Hunter, type HuntProfile } from './npc';
import { HuntStats } from './stats';

/** 판정 틱(ms) — 물리가 없어 성기게 돌아도 된다. AI 걸음과 리스폰·전환만 여기서 민다 */
const HUNT_TICK_MS = 100;
/** 서버가 받아 주는 이동 상한 — 달리기(5.2 m/s, mp/bodies.ts)까지는 정상이다. 그 너머는 순간이동 */
const MAX_SPEED = WALK_SPEED * 2.5;
/** 줍기 거리 검증의 슬랙 — move 가 10Hz 라 서버가 아는 자리는 최대 한 걸음 뒤다 */
const PICK_SLACK = 0.6;
/** 구슬이 벽에 붙지 않게 마당에서 들이는 값 */
const INSET = 0.7;

interface Orb {
  id: number;
  x: number;
  z: number;
  hue: HuntHueKey;
}

export class ColorhuntEngine implements GameEngine {
  readonly game = 'colorhunt' as const;
  readonly durationMs = TRIAL_GAME_MS;

  private ctx: EngineContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private endedAt = 0;
  private lastTick = 0;
  private lastSnapshot = 0;
  private phase = 1;
  /** 조명이 실제로 바뀐 시각들 — 머뭇(P3)의 기준 */
  private switchAts: number[] = [];
  private targets: HuntHueKey[] = [];
  private orbs = new Map<number, Orb>();
  private nextOrbId = 1;
  /** 주워진 자리 근처에 같은 색이 다시 돋는 예약 */
  private respawns: { at: number; hue: HuntHueKey; x: number; z: number }[] = [];
  private stats = new Map<string, HuntStats>();
  private hunters: Hunter[] = [];
  private profiles = new Map<string, HuntProfile>();

  condition(): TrialCondition {
    return { lightFilter: COLORHUNT_BLOCK };
  }

  start(intensity: number, realIds: readonly string[], aiIds: readonly string[], ctx: EngineContext, tuning?: Record<string, SeatTuning>): void {
    this.stop();
    this.ctx = ctx;
    const now = Date.now();
    this.startedAt = now;
    this.endedAt = 0;
    this.lastTick = now;
    this.lastSnapshot = now;
    this.phase = 1;
    this.switchAts = [];
    this.targets = pickTargets(intensity, COLORHUNT_BLOCK);
    this.respawns = [];
    this.stats = new Map();
    this.seedOrbs();

    for (const id of realIds) this.stats.set(id, new HuntStats());

    this.hunters = aiIds.map((id, i) => {
      const t = tuning?.[id];
      let profile = this.profiles.get(id);
      // 전략(tuning)이 오면 새로 뽑는다 — AI 가 테스트마다 "얼마나 티 나게"를 다시 정한다 (P9)
      if (t || !profile) {
        profile = makeHuntProfile(i, t?.precision);
        this.profiles.set(id, profile);
      }
      const x = HUNT_ARENA.minX + 1.5 + Math.random() * (HUNT_ARENA.maxX - HUNT_ARENA.minX - 3);
      const z = HUNT_ARENA.minZ + 1.5 + Math.random() * (HUNT_ARENA.maxZ - HUNT_ARENA.minZ - 3);
      const st = new HuntStats();
      st.setPos(x, z, now);
      this.stats.set(id, st);
      const h = makeHunter(id, x, z, profile);
      // 시작 직후부터 바로 줍지 않는다 — 사람도 지시문을 읽고 둘러보는 시간이 있다
      h.nextActAt = now + 1200 + Math.random() * 1800;
      return h;
    });

    this.broadcastSync(now);
    this.timer = setInterval(() => this.tick(), HUNT_TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  join(id: string): void {
    if (this.stats.has(id)) return;
    this.stats.set(id, new HuntStats());
    // 도중에 들어온 사람도 구슬·조명·목표를 봐야 한다 — 전체 동기화를 다시 뿌린다 (받는 쪽은 통째로 갈아끼운다)
    if (this.ctx && this.endedAt === 0) this.broadcastSync(Date.now());
  }

  onAccel(): void {
    /* 색 사냥은 W/S 시행이 없다 */
  }

  onBrake(): void {
    /* 위와 같다 */
  }

  onMove(id: string, x: number, z: number, now: number): void {
    if (!this.ctx) return;
    this.join(id);
    const s = this.stats.get(id)!;
    const dt = Math.max(1, now - s.at) / 1000;
    if (s.seen && Math.hypot(x - s.x, z - s.z) / dt > MAX_SPEED) return; // 순간이동은 버린다
    s.setPos(clamp(x, HUNT_ARENA.minX, HUNT_ARENA.maxX), clamp(z, HUNT_ARENA.minZ, HUNT_ARENA.maxZ), now);
  }

  /** 사람의 E — 거리·쿨다운·구슬 존재를 보고 판정한다. 정오는 안 알려 준다(§6) */
  onPick(id: string, objectId: number): void {
    if (!this.ctx || this.endedAt !== 0) return;
    this.join(id);
    const s = this.stats.get(id)!;
    const now = Date.now();
    if (!s.cooldownOk(now, HUNT_PICK_COOLDOWN_MS)) return;
    const orb = this.orbs.get(objectId);
    if (!orb) return; // 이미 남이 주웠다 — 흘린다
    if (s.seen && Math.hypot(orb.x - s.x, orb.z - s.z) > HUNT_PICK_R + PICK_SLACK) return;
    this.doPick(id, orb, now);
  }

  done(): boolean {
    return this.endedAt !== 0;
  }

  results(): TrialPlayerResult[] {
    return [...this.stats]
      .filter(([, s]) => s.pickCount > 0) // 한 번도 안 주운 사람은 뺀다 — 0 이 「완벽」으로 읽히면 안 된다
      .map(([id, s]) => s.result(id, this.switchAts));
  }

  /* ─────────────────────────────── 안 ─────────────────────────────── */

  /** 7색 × 10개 — 격자에 색을 섞어 뿌린다. 격자라 처음부터 고르게 퍼져 있고, 지터로 줄이 안 보인다 */
  private seedOrbs(): void {
    this.orbs = new Map();
    this.nextOrbId = 1;
    const hues: HuntHueKey[] = [];
    for (const h of HUNT_HUES) for (let i = 0; i < HUNT_ORBS_PER_HUE; i += 1) hues.push(h.key);
    // Fisher–Yates — 색이 격자 위에서 뭉치지 않게
    for (let i = hues.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [hues[i], hues[j]] = [hues[j], hues[i]];
    }
    const cols = 7;
    const rows = Math.ceil(hues.length / cols);
    const w = HUNT_ARENA.maxX - HUNT_ARENA.minX - INSET * 2;
    const d = HUNT_ARENA.maxZ - HUNT_ARENA.minZ - INSET * 2;
    hues.forEach((hue, i) => {
      const cx = HUNT_ARENA.minX + INSET + ((i % cols) + 0.5) * (w / cols);
      const cz = HUNT_ARENA.minZ + INSET + (Math.floor(i / cols) + 0.5) * (d / rows);
      this.orbs.set(this.nextOrbId, {
        id: this.nextOrbId,
        x: clamp(cx + (Math.random() - 0.5) * 0.9, HUNT_ARENA.minX + INSET, HUNT_ARENA.maxX - INSET),
        z: clamp(cz + (Math.random() - 0.5) * 0.9, HUNT_ARENA.minZ + INSET, HUNT_ARENA.maxZ - INSET),
        hue,
      });
      this.nextOrbId += 1;
    });
  }

  private currentBlock(): string | null {
    return COLORHUNT_BLOCK[this.phase - 1] ?? null;
  }

  private currentTarget(): HuntHueKey {
    return this.targets[this.phase - 1] ?? 'yellow';
  }

  /** 시작 · 전환 · 늦은 입장 — 구슬·견본판·목표색을 통째로. 전부 표시색이다 (P8) */
  private broadcastSync(at: number): void {
    if (!this.ctx) return;
    const block = this.currentBlock();
    const light = lightOf(block);
    const target = hueOf(this.currentTarget());
    this.ctx.broadcast({
      t: 'trial_colorhunt',
      at,
      light: lightHex(block),
      target: target.name,
      targetHex: shownHex(target.refl, [1, 1, 1]),
      orbs: [...this.orbs.values()].map((o) => this.wireOrb(o, light)),
      board: HUNT_HUES.map((h) => ({ name: h.name, c: shownHex(h.refl, light) })),
    });
  }

  private wireOrb(o: Orb, light: readonly [number, number, number]): ColorOrb {
    return { id: o.id, x: round2(o.x), z: round2(o.z), c: shownHex(hueOf(o.hue).refl, light) };
  }

  /** 실제 판정 — 사람의 E 도 AI 의 걸음도 여기로 온다. 같은 규칙, 같은 기록 */
  private doPick(id: string, orb: Orb, now: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.orbs.delete(orb.id);
    this.respawns.push({ at: now + HUNT_RESPAWN_MS, hue: orb.hue, x: orb.x, z: orb.z });

    const target = this.currentTarget();
    const correct = orb.hue === target;
    const honest = !correct && confusableWith(target, this.currentBlock()).includes(orb.hue);
    this.stats.get(id)?.record({ at: now, phase: this.phase, correct, honest });
    ctx.broadcast({ t: 'trial_picked', id, objectId: orb.id });
  }

  /**
   * AI 가 이번에 노릴 구슬 — 정오 주사위(프로파일의 인간 분포)를 굴리고, 그 결과에 맞는 색의
   * 구슬 중 **가장 가까운 것**을 고른다. 틀릴 때는 대개 합류색으로 틀린다(honestP) — 오답의
   * 방향까지 사람을 따라야 P4 축에서 안 튄다.
   */
  private chooseOrbFor(h: Hunter): { id: number; x: number; z: number } | null {
    const block = this.currentBlock();
    const target = this.currentTarget();
    const kind = target === deadHue(block) ? 'dead' : confusableWith(target, block).length > 0 ? 'merged' : 'base';
    const acc = kind === 'dead' ? h.profile.accDead : kind === 'merged' ? h.profile.accMerged : h.profile.accBase;
    const wantCorrect = Math.random() < acc;

    let pool: Orb[];
    if (wantCorrect) {
      pool = [...this.orbs.values()].filter((o) => o.hue === target);
    } else {
      const conf = confusableWith(target, block);
      const honest = conf.length > 0 && Math.random() < h.profile.honestP;
      pool = [...this.orbs.values()].filter((o) => (honest ? conf.includes(o.hue) : o.hue !== target));
    }
    if (!pool.length) pool = [...this.orbs.values()];
    if (!pool.length) return null;
    let best = pool[0];
    let bestD = Number.POSITIVE_INFINITY;
    for (const o of pool) {
      const d = Math.hypot(o.x - h.x, o.z - h.z);
      if (d < bestD) {
        best = o;
        bestD = d;
      }
    }
    return { id: best.id, x: best.x, z: best.z };
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = Date.now();
    const dt = Math.min(0.3, (now - this.lastTick) / 1000);
    this.lastTick = now;

    if (now - this.startedAt >= TRIAL_GAME_MS) {
      this.endedAt = now;
      this.stop();
      ctx.finish();
      return;
    }

    // 20초마다 조명이 바뀐다 — 이번엔 알린다(방이 통째로 물든다). 무엇이 차단됐는지는 안 알린다
    const ph = phaseAt(now - this.startedAt);
    if (ph !== this.phase) {
      this.phase = ph;
      this.switchAts.push(now);
      for (const h of this.hunters) hunterOnSwitch(h, now);
      this.broadcastSync(now);
    }

    // 리스폰 — 죽은 자리 근처에 같은 색 (위치 기억 §5-① 을 지키는 값)
    while (this.respawns.length && this.respawns[0].at <= now) {
      const r = this.respawns.shift()!;
      const orb: Orb = {
        id: this.nextOrbId++,
        x: clamp(r.x + (Math.random() - 0.5) * 2 * HUNT_RESPAWN_JITTER, HUNT_ARENA.minX + INSET, HUNT_ARENA.maxX - INSET),
        z: clamp(r.z + (Math.random() - 0.5) * 2 * HUNT_RESPAWN_JITTER, HUNT_ARENA.minZ + INSET, HUNT_ARENA.maxZ - INSET),
        hue: r.hue,
      };
      this.orbs.set(orb.id, orb);
      ctx.broadcast({ t: 'trial_orb', orb: this.wireOrb(orb, lightOf(this.currentBlock())) });
    }

    // AI 걸음 — 사람과 같은 걷기 속도, 같은 doPick
    for (const h of this.hunters) {
      stepHunter(
        h,
        now,
        dt,
        (x) => this.chooseOrbFor(x),
        (id, orbId) => {
          const o = this.orbs.get(orbId);
          if (o) this.doPick(id, o, now); // 노리던 사이 남이 주웠으면 그냥 허탕이다 — 사람도 그런다
        },
      );
      this.stats.get(h.id)?.setPos(h.x, h.z, now);
    }

    if (now - this.lastSnapshot >= FALL_SNAPSHOT_MS) {
      this.lastSnapshot = now;
      ctx.broadcast({ t: 'trial_snapshot', at: now, objects: [], ai: this.hunters.map((h) => ({ id: h.id, x: round2(h.x), z: round2(h.z) })) });
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
