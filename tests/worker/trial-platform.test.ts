/**
 * 움직이는 플랫폼 — 발판 자리 함수(mp/platform.ts, 클라·워커 공용) · 점프 기록(JumpStats) · 엔진 한 판.
 *
 * 스펙(2026-09-05): 착지 성공률 · 발판 중앙 착지율 · 점프 실패 횟수 · 착지 후 균형 회복. 열 번 뛰어 열 번 정중앙이면 기록에 그대로 남아야 한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JUMP_SPEED, GRAVITY, PLATFORM_GAME_MS, TRIAL_PHASE_MS } from '../../src/world/mp/constants';
import { PADS, PAD_CENTER_R, PAD_R, PAD_TOP, padAt, padUnder, platformGroundAt, scaledTime } from '../../src/world/mp/platform';
import type { S2CMessage } from '../../src/world/mp/protocol';
import { PlatformEngine } from '../../worker/src/trial/platform/engine';
import { JumpStats } from '../../worker/src/trial/platform/stats';

describe('발판 자리 — 서버와 클라가 같은 식으로 계산한다', () => {
  it('출발·도착 발판은 서 있고 나머지는 좌우로 움직인다', () => {
    expect(padAt(0, 5000, 1).x).toBe(0);
    expect(padAt(PADS.length - 1, 5000, 1).x).toBe(0);
    const a = padAt(1, 0, 1).x;
    const b = padAt(1, 1000, 1).x;
    expect(a).not.toBeCloseTo(b, 2);
  });

  it('구간이 바뀌어도 발판이 순간이동하지 않는다 — 누적 시간이 이어진다', () => {
    const before = padAt(2, TRIAL_PHASE_MS - 1, 1.35).x;
    const after = padAt(2, TRIAL_PHASE_MS + 1, 1.35).x;
    expect(Math.abs(after - before)).toBeLessThan(0.02);
    expect(scaledTime(TRIAL_PHASE_MS * 2, 1)).toBeCloseTo(20 + 20 * 1.4, 5);
  });

  it('발판 위(발이 윗면 근처)면 바닥이 PAD_TOP, 밖이면 0', () => {
    const p = padAt(1, 1234, 1);
    expect(padUnder(p.x, p.z, 1234, 1)?.k).toBe(1);
    expect(padUnder(p.x + PAD_R + 0.2, p.z, 1234, 1)).toBeNull();
    expect(platformGroundAt(p.x, p.z, PAD_TOP, 1234, 1)).toBe(PAD_TOP);
    expect(platformGroundAt(p.x, p.z, 0, 1234, 1)).toBe(0);
  });
});

/** 발판 k 의 중심에서 dx 만큼 벗어난 자리로 뛰는 포물선을 10Hz 샘플로 흘려 넣는다 */
function jumpInto(s: JumpStats, k: number, dx: number, t0: number, startedAt: number, pace: number, onLand?: Parameters<JumpStats['sample']>[4]): number {
  const air = (2 * JUMP_SPEED) / GRAVITY;
  const from = padAt(k - 1, t0 - startedAt, pace);
  // 서 있던 자리 두 샘플
  s.sample(from.x, from.z, PAD_TOP, t0, onLand);
  s.sample(from.x, from.z, PAD_TOP, t0 + 100, onLand);
  let t = t0 + 200;
  for (let f = 0.1; f <= 1.0001; f += 0.1) {
    const tt = f * air;
    const target = padAt(k, t - startedAt + (air - tt) * 1000, pace);
    const x = from.x + (target.x + dx - from.x) * f;
    const z = from.z + (target.z - from.z) * f;
    const y = PAD_TOP + Math.max(0, JUMP_SPEED * tt - 0.5 * GRAVITY * tt * tt);
    s.sample(x, z, y, t, onLand);
    t += 100;
  }
  return t;
}

describe('JumpStats — 착지·중앙·실패·균형 회복을 샘플에서 읽는다', () => {
  it('열 번 뛰어 열 번 정중앙이면 centerRate 1 · landingRate 1 · misses 0', () => {
    const start = 1_000_000;
    const s = new JumpStats(start, 1);
    let t = start + 500;
    const seen: { center: boolean; missed: boolean }[] = [];
    for (let k = 1; k <= 6; k++) t = jumpInto(s, k, 0, t + 600, start, 1, (e) => seen.push(e));
    for (let k = 5; k >= 2; k--) t = jumpInto(s, k, 0, t + 600, start, 1, (e) => seen.push(e));
    const r = s.result('ai', [start, start + TRIAL_PHASE_MS, start + TRIAL_PHASE_MS * 2]);
    expect(r.metrics.jumps).toBe(10);
    expect(r.metrics.landingRate).toBe(1);
    expect(r.metrics.centerRate).toBe(1);
    expect(r.metrics.misses).toBe(0);
    expect(r.metrics.meanOffset).toBeLessThan(PAD_CENTER_R);
    expect(seen.filter((e) => e.center)).toHaveLength(10);
  });

  it('발판 밖으로 뛰면 실패로 센다 — 바닥에 떨어진다', () => {
    const start = 2_000_000;
    const s = new JumpStats(start, 1);
    const air = (2 * JUMP_SPEED) / GRAVITY;
    const from = padAt(0, 0, 1);
    s.sample(from.x, from.z, PAD_TOP, start + 500);
    s.sample(from.x, from.z, PAD_TOP, start + 600);
    // 옆으로 크게 빗나가 바닥으로
    let t = start + 700;
    for (let f = 0.1; f <= 1.3; f += 0.1) {
      const tt = f * air;
      const y = Math.max(0, PAD_TOP + JUMP_SPEED * tt - 0.5 * GRAVITY * tt * tt);
      s.sample(from.x + 3 * f, from.z - 2 * f, y, t);
      t += 100;
    }
    const r = s.result('h', [start]);
    expect(r.metrics.jumps).toBe(1);
    expect(r.metrics.landingRate).toBe(0);
    expect(r.metrics.misses).toBe(1);
  });

  it('착지 뒤 휘청거리면 균형 회복이 길고, 바로 멈추면 짧다', () => {
    const start = 3_000_000;
    const calm = new JumpStats(start, 1);
    let t = jumpInto(calm, 1, 0, start + 500, start, 1);
    // 발판을 따라 가만히 서 있다 (발판 이동분만큼 x 가 움직인다)
    for (let i = 0; i < 5; i++) {
      const p = padAt(1, t - start, 1);
      calm.sample(p.x, p.z, PAD_TOP, t);
      t += 100;
    }
    const wobbly = new JumpStats(start, 1);
    t = jumpInto(wobbly, 1, 0, start + 500, start, 1);
    // 3초 내내 휘청 — 상한(2.5초)에서 끊긴다
    for (let i = 0; i < 30; i++) {
      const p = padAt(1, t - start, 1);
      wobbly.sample(p.x + (i % 2 ? 0.3 : -0.3), p.z, PAD_TOP, t);
      t += 100;
    }
    const a = calm.result('a', [start]).metrics.recoveryMs;
    const b = wobbly.result('b', [start]).metrics.recoveryMs;
    expect(a).toBeLessThan(400);
    expect(b).toBeGreaterThan(a);
  });
});

describe('PlatformEngine — 한 판', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('30초 뒤 finish 를 부르고, 봇 스냅샷에는 y 가 실리며, 결과에 조건값이 없다', () => {
    const sent: S2CMessage[] = [];
    let finished = 0;
    const engine = new PlatformEngine();
    engine.start(2, ['me'], ['SUBJECT_01', 'SUBJECT_02'], { broadcast: (m) => sent.push(m), finish: () => (finished += 1) }, {
      SUBJECT_01: { precision: 1 },
      SUBJECT_02: { precision: 0.1 },
    });
    expect(engine.paceFor(2)).toBeCloseTo(1.35, 5);
    vi.advanceTimersByTime(PLATFORM_GAME_MS + 200);
    expect(finished).toBe(1);
    const snaps = sent.filter((m): m is Extract<S2CMessage, { t: 'trial_snapshot' }> => m.t === 'trial_snapshot');
    expect(snaps.length).toBeGreaterThan(50);
    expect(snaps.some((s) => s.ai.some((a) => typeof a.y === 'number'))).toBe(true);
    // 봇은 30초 동안 뛴다 — 기계 쪽은 중앙 착지가 사람 쪽보다 고르고 완주한다
    const results = engine.results();
    const ai = results.find((r) => r.id === 'SUBJECT_01')!;
    const human = results.find((r) => r.id === 'SUBJECT_02')!;
    expect(ai.metrics.jumps).toBeGreaterThan(3);
    expect(human.metrics.jumps).toBeGreaterThan(1);
    expect(ai.metrics.centerRate).toBeGreaterThanOrEqual(human.metrics.centerRate - 0.2);
    expect(ai.metrics.finishMs).toBeGreaterThan(0);
    expect(ai.metrics.finishMs).toBeLessThan(PLATFORM_GAME_MS);
    for (const r of results) expect('condition' in r).toBe(false);
    expect(JSON.stringify(sent)).not.toMatch(/platformPace/);
  });
});

describe('돌아가기 · 완주 (2026-09-05 사용자: 떨어지면 출발로, 끝까지 가면 거기서 대기)', () => {
  it('바닥에 떨어진 뒤 출발 발판으로 옮겨진 것은 점프로 안 센다 — 실패 1, 그 뒤 착지는 정상으로 이어진다', () => {
    const start = 5_000_000;
    const s = new JumpStats(start, 1);
    const air = (2 * JUMP_SPEED) / GRAVITY;
    const from = padAt(0, 0, 1);
    s.sample(from.x, from.z, PAD_TOP, start + 500);
    s.sample(from.x, from.z, PAD_TOP, start + 600);
    let t = start + 700;
    for (let f = 0.1; f <= 1.3; f += 0.1) {
      const tt = f * air;
      const y = Math.max(0, PAD_TOP + JUMP_SPEED * tt - 0.5 * GRAVITY * tt * tt);
      s.sample(from.x + 3 * f, from.z - 2 * f, y, t);
      t += 100;
    }
    // 넘어져 있다가(600ms) 출발 발판으로 — 한 샘플에 3m 넘게 옮겨진다
    t += 600;
    s.sample(from.x, from.z, PAD_TOP, t);
    s.sample(from.x, from.z, PAD_TOP, t + 100);
    const mid = s.result('h', [start]);
    expect(mid.metrics.jumps).toBe(1);
    expect(mid.metrics.misses).toBe(1);
    // 그 뒤 제대로 뛰면 착지로 센다
    t = jumpInto(s, 1, 0, t + 400, start, 1);
    const r = s.result('h', [start]);
    expect(r.metrics.jumps).toBe(2);
    expect(r.metrics.landingRate).toBe(0.5);
    expect(r.metrics.misses).toBe(1);
  });

  it('도착 발판에 내리면 finishMs 가 적히고, 못 갔으면 NaN', () => {
    const start = 6_000_000;
    const s = new JumpStats(start, 1);
    let t = start + 500;
    for (let k = 1; k < PADS.length; k++) t = jumpInto(s, k, 0, t + 600, start, 1);
    const r = s.result('ai', [start]);
    expect(r.metrics.finishMs).toBeGreaterThan(0);
    expect(r.metrics.finishMs).toBeLessThan(t - start);
    const none = new JumpStats(start, 1);
    none.sample(0, padAt(0, 0, 1).z, PAD_TOP, start + 100);
    expect(Number.isNaN(none.result('h', [start]).metrics.finishMs)).toBe(true);
  });

  it('기계 봇은 30초 안에 완주해 도착 발판 위에 서 있고, 떨어진 봇은 바닥에 머물지 않는다', () => {
    vi.useFakeTimers();
    try {
      const sent: S2CMessage[] = [];
      const engine = new PlatformEngine();
      engine.start(1, [], ['SUBJECT_01', 'SUBJECT_02'], { broadcast: (m) => sent.push(m), finish: () => undefined }, {
        SUBJECT_01: { precision: 1 },
        SUBJECT_02: { precision: 0 },
      });
      vi.advanceTimersByTime(PLATFORM_GAME_MS - 500);
      const snaps = sent.filter((m): m is Extract<S2CMessage, { t: 'trial_snapshot' }> => m.t === 'trial_snapshot');
      const last = snaps[snaps.length - 1];
      const ai = last.ai.find((a) => a.id === 'SUBJECT_01')!;
      expect(ai.z).toBeCloseTo(PADS[PADS.length - 1].z, 1);
      expect(ai.y).toBeCloseTo(PAD_TOP, 1);
      // 바닥(y 0)에 연속으로 오래 있는 봇은 없다 — 넘어진 뒤 곧 출발 발판(0.5)으로 돌아간다
      let floorRun = 0;
      let worst = 0;
      for (const s of snaps) {
        const h = s.ai.find((a) => a.id === 'SUBJECT_02')!;
        floorRun = (h.y ?? 0) < 0.05 ? floorRun + 1 : 0;
        worst = Math.max(worst, floorRun);
      }
      expect(worst).toBeLessThan(25); // 스냅샷 100ms — 2.5초 넘게 바닥에 있지 않는다
    } finally {
      vi.useRealTimers();
    }
  });
});
