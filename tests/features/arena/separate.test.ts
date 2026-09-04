/**
 * 몸끼리 떼어 놓기 — **로봇은 로봇을 통과하지 않는다** (2026-09-01 사용자 요청).
 *
 * 여기가 틀리면 두 가지가 깨진다.
 *   ① 그림 — 다섯이 한 자리에 포개져 하나로 보인다 (겹쳐 서면 몸이 사라진 것과 같다).
 *   ② 판 — 「시작 자리에서 0.6m 넘게 벗어나지 마라」(lab/quick 의 still) 같은 처형판에서
 *      **가만히 선 개체가 남에게 밀려** 걸어 나간 것으로 기록되면 애먼 몸이 폐기된다.
 *      그래서 비키는 쪽은 늘 걷는 쪽이다 — 아래 「선 몸은 안 밀린다」가 그 잠금이다.
 */
import { describe, expect, it } from 'vitest';
import { BOT_GAP, separateBots, type Solid } from '@/features/arena/separate';
import { ARENA, BODY_GAP, SPEED, START, distance, pathFor, type Obstacle, type Pt } from '@/lab/arena';
import { OBJECTS } from '@/lab/objects';
import { QUICK_GAMES, judgeQuick } from '@/lab/quick';
import type { Sample } from '@/lab/spec';

/** 가구 없는 빈 바닥 — 밀어내기만 본다 */
const EMPTY: Obstacle[] = [];
const gap = (a: Solid, b: Solid) => Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z);
const walking = (x: number, z: number): Solid => ({ p: { x, z }, moving: true });
const standing = (x: number, z: number): Solid => ({ p: { x, z }, moving: false });

describe('separateBots', () => {
  it('겹친 두 몸은 몸 폭만큼 벌어진다', () => {
    const a = walking(0, 0);
    const b = walking(0.2, 0);
    separateBots([a, b], EMPTY);
    expect(gap(a, b)).toBeCloseTo(BOT_GAP, 5);
  });

  it('떨어져 있으면 아무도 안 옮긴다', () => {
    const a = walking(0, 0);
    const b = walking(3, 0);
    separateBots([a, b], EMPTY);
    expect(a.p).toEqual({ x: 0, z: 0 });
    expect(b.p).toEqual({ x: 3, z: 0 });
  });

  it('선 몸은 안 밀린다 — 비키는 쪽은 걷는 쪽이다', () => {
    const stood = standing(0, 0);
    const walker = walking(0.3, 0);
    separateBots([stood, walker], EMPTY);
    expect(stood.p).toEqual({ x: 0, z: 0 });
    expect(gap(stood, walker)).toBeCloseTo(BOT_GAP, 5);
  });

  it('둘 다 걸으면 절반씩 나눠 물러난다', () => {
    const a = walking(-0.2, 0);
    const b = walking(0.2, 0);
    separateBots([a, b], EMPTY);
    expect(a.p.x).toBeCloseTo(-BOT_GAP / 2, 5);
    expect(b.p.x).toBeCloseTo(BOT_GAP / 2, 5);
  });

  it('둘 다 서 있으면(겹친 채 도착했다) 그때만 양쪽을 가른다', () => {
    const a = standing(-0.1, 0);
    const b = standing(0.1, 0);
    separateBots([a, b], EMPTY);
    expect(gap(a, b)).toBeCloseTo(BOT_GAP, 5);
    expect(a.p.x).toBeLessThan(-0.1);
    expect(b.p.x).toBeGreaterThan(0.1);
  });

  it('내 몸(fixed)은 절대 안 옮긴다 — 개체가 나를 피해 돈다', () => {
    const me: Solid = { p: { x: 2, z: -3 }, moving: false, fixed: true };
    const bot = walking(2.1, -3);
    separateBots([me, bot], EMPTY);
    expect(me.p).toEqual({ x: 2, z: -3 });
    expect(gap(me, bot)).toBeCloseTo(BOT_GAP, 5);
  });

  it('완전히 겹쳐도(거리 0) NaN 없이 갈라진다', () => {
    const a = walking(1, 1);
    const b = walking(1, 1);
    separateBots([a, b], EMPTY);
    expect(Number.isFinite(a.p.x) && Number.isFinite(a.p.z)).toBe(true);
    expect(Number.isFinite(b.p.x) && Number.isFinite(b.p.z)).toBe(true);
    expect(gap(a, b)).toBeGreaterThan(BOT_GAP - 1e-6);
  });

  it('다섯이 한 점에 포개져도 서로 떨어질 때까지 벌어진다', () => {
    const ws = Array.from({ length: 5 }, () => walking(0, -2));
    for (let i = 0; i < 30; i += 1) separateBots(ws, EMPTY);
    for (let i = 0; i < ws.length; i += 1)
      for (let j = i + 1; j < ws.length; j += 1) expect(gap(ws[i], ws[j])).toBeGreaterThan(BOT_GAP - 1e-3);
  });

  it('가구 속으로는 안 민다 — 밀려서 콘솔에 박히느니 겹친 채 둔다', () => {
    const wall: Obstacle[] = [{ id: '콘솔1', x: 1, z: 0, hw: 0.5, hd: 0.5 }];
    const stood = standing(0.2, 0); // 가구 왼쪽에 바짝
    const walker = walking(0.35, 0); // 가구 쪽으로 밀려야 하는 자리
    separateBots([stood, walker], wall);
    // 밀린 자리가 가구 안이면 안 옮긴다 (겹침은 남지만 몸이 물건에 박히지는 않는다)
    expect(walker.p.x).toBeLessThan(wall[0].x - wall[0].hw + 0.4);
  });

  it('판 밖으로는 안 나간다', () => {
    const a = walking(ARENA.minX + 0.6, 0);
    const b = walking(ARENA.minX + 0.7, 0);
    separateBots([a, b], EMPTY);
    expect(a.p.x).toBeGreaterThanOrEqual(ARENA.minX + 0.6);
    expect(b.p.x).toBeGreaterThanOrEqual(ARENA.minX + 0.6);
  });

  it('내가 몸으로 밀어도 선 개체는 안 밀린다 — 그 밀린 만큼이 처형판의 폐기 사유가 된다', () => {
    /*
     * 「그 자리에서 한 발짝도 움직이지 마라」(quick 의 freeze — 처형판)가 도는 동안, 내가 개체
     * 속으로 걸어 들어가는 것만으로 그 개체를 0.6m 밖으로 떠밀 수 있으면 **내가 손 하나 안 대고
     * 아무나 죽일 수 있다.** 밀리는 쪽은 내 몸이다 (씬의 remotePlayers.pushOut).
     */
    const stood = standing(4, -5);
    const me: Solid = { p: { x: 4.2, z: -5 }, moving: false, fixed: true };
    for (let i = 0; i < 30; i += 1) separateBots([stood, me], EMPTY);
    expect(stood.p).toEqual({ x: 4, z: -5 });
    expect(me.p).toEqual({ x: 4.2, z: -5 });
  });

  it('3D 의 몸 폭과 판이 아는 몸 폭이 같은 수다 — 갈리면 한쪽만 밀어낸다', () => {
    // BOT_GAP 은 arena3d(그리는 쪽), BODY_GAP 은 lab(판을 까는 쪽)이 쓴다. 두 수가 어긋나면
    // 판은 설 수 있다고 깔아 놓고 그림은 서로 밀어내는, 아무도 못 맞추는 자리가 생긴다
    expect(BOT_GAP).toBe(BODY_GAP);
  });
});

/**
 * ── 판 전체가 **같이** 돌 때 오탐이 나지 않는가 ──
 *
 * tests/lab/quick.test.ts 의 시뮬레이터는 봇을 **하나씩 따로** 돌린다 — 그때는 아무도 남을 안 민다.
 * 그런데 실제 시행 루프는 프레임마다 separateBots 를 돌리므로(features/arena/ArenaFeature),
 * 같은 원으로 부르는 판에서는 몸끼리 밀린다. 그 밀림이 원 밖으로 나가면 **제 지시대로 걸어온 개체가
 * 어긋난 것으로 기록된다** — 밀어내기를 처음 켠 날 콘솔 정렬 13% · 왕복 15% 가 그렇게 걸렸다.
 *
 * 그래서 여기서는 다섯을 **한 판에 같이** 돌린다. 무작위는 씨앗을 고정해 매번 같은 판이 서게 한다.
 */
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OBSTACLES: Obstacle[] = OBJECTS.map((o) => ({ id: o.id, x: o.x, z: o.z, hw: o.hw, hd: o.hd }));
const JUMP_SEC = 0.32;
const JUMP_H = 0.5;
/** 다섯이 홀 여기저기 흩어져 선 채로 판이 선다 — 시행은 아무도 출발선으로 옮기지 않는다 */
const STANDS: Pt[] = [
  { x: -8, z: -6 },
  { x: 8, z: -6 },
  { x: -6, z: 5 },
  { x: 6, z: 5 },
  { x: 0, z: 0 },
];

/** 시행 루프 한 판 — 계획 집행 · 걸음 · 점프 · **밀어내기** · 100ms 기록 (ArenaFeature 의 tick 과 같은 차례) */
function runTogether(trial: ReturnType<(typeof QUICK_GAMES)[number]['make']>, starts: Pt[], me: Pt) {
  const dt = 1 / 60;
  const bots = starts.map((p) => ({ x: p.x, z: p.z, y: 0, route: [] as Pt[], jumpUntil: -1, done: 0, samples: [] as Sample[] }));
  const moves = bots.map((b, seat) => trial.plan(seat, { x: b.x, z: b.z }));
  let nextSample = 0;
  for (let t = 0; t < trial.seconds; t += dt) {
    bots.forEach((b, seat) => {
      const ms = moves[seat];
      while (b.done < ms.length && ms[b.done].at <= t) {
        const m = ms[b.done];
        if (m.action === 'walk' && m.x !== undefined && m.z !== undefined) b.route = pathFor(b, { x: m.x, z: m.z }, OBSTACLES);
        else if (m.action === 'jump') b.jumpUntil = t + JUMP_SEC;
        else if (m.action === 'stay') b.route = [];
        b.done += 1;
      }
      const target = b.route[0];
      if (target) {
        const d = distance(b, target);
        const step = SPEED * dt;
        if (d <= step) {
          b.x = target.x;
          b.z = target.z;
          b.route.shift();
        } else {
          b.x += ((target.x - b.x) / d) * step;
          b.z += ((target.z - b.z) / d) * step;
        }
      }
      b.y = t < b.jumpUntil ? Math.sin(((b.jumpUntil - t) / JUMP_SEC) * Math.PI) * JUMP_H : 0;
    });
    // 나도 판 위에 있다 — 서 있고, 여기서는 안 옮긴다 (내 몸은 씬이 쥔다)
    separateBots([...bots.map((b) => ({ p: b, moving: b.route.length > 0 })), { p: me, moving: false, fixed: true }], OBSTACLES);
    if (t >= nextSample) {
      nextSample += 0.1;
      bots.forEach((b) => b.samples.push({ t: +t.toFixed(1), x: +b.x.toFixed(2), z: +b.z.toFixed(2), y: +b.y.toFixed(2) }));
    }
  }
  return bots.map((b, i) => ({ who: `A-${i}`, samples: b.samples }));
}

describe('다섯이 한 판에서 같이 움직여도', () => {
  const ROUNDS = 20;
  /** 판마다 오탐 수를 센다 — 씨앗이 고정이라 같은 코드면 같은 수가 나온다 */
  function tally(): Record<string, number> {
    const real = Math.random;
    Math.random = mulberry(12345);
    const out: Record<string, number> = {};
    try {
      QUICK_GAMES.forEach((g) => {
        out[g.id] = 0;
        for (let round = 0; round < ROUNDS; round += 1) {
          const starts = STANDS.map((p) => ({ ...p }));
          const t = g.make([...starts, START]);
          const got = judgeQuick(t, runTogether(t, starts, { x: START.x, z: START.z }));
          out[g.id] += got.filter((v) => v.grade !== 'normal').length;
        }
      });
    } finally {
      Math.random = real;
    }
    return out;
  }

  const counted = tally();
  const RECORDS = ROUNDS * STANDS.length;

  it('처형판은 오탐이 하나도 없다 — 여기 한 번이 곧 애먼 개체의 폐기다', () => {
    QUICK_GAMES.filter((g) => g.stakes === 'execute').forEach((g) => {
      expect(counted[g.id], `${g.id} — 제 계획대로 하고도 걸린 기록`).toBe(0);
    });
  });

  it('의심판도 밀려서 걸리는 일이 거의 없다 — 100 번에 세 번 밑이다', () => {
    // 예외가 없다 — 갈리라고 만든 투표판을 뺐으므로(2026-09-02) 모든 의심판이 같은 문턱을 받는다
    QUICK_GAMES.filter((g) => g.stakes === 'suspect').forEach((g) => {
      const pct = (counted[g.id] / RECORDS) * 100;
      expect(pct, `${g.id} — 밀려서 걸린 기록 ${counted[g.id]}/${RECORDS}`).toBeLessThanOrEqual(3);
    });
  });
});
