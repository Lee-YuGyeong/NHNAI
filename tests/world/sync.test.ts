import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bystanders } from '../../src/world/mp/bystanders';
import { SYNC_GLITCH, SYNC_MAX, sync } from '../../src/world/mp/sync';

describe('SYNC STABILITY — 정신과 몸의 동기화율', () => {
  beforeEach(() => {
    sync.reset();
    sync.bind(null);
    bystanders.drop('a');
  });

  it('98 에서 시작하고 100 은 없다 — 남의 몸이다', () => {
    expect(sync.get().value).toBe(SYNC_MAX);
    sync.tick(10, true, 0, 0, 1000);
    expect(sync.get().value).toBe(SYNC_MAX);
  });

  it('충격에 떨어지고, 가만히 서면 걸을 때보다 빨리 오른다', () => {
    sync.shock(20, '충격', 0);
    expect(sync.get().value).toBe(78);
    expect(sync.get().last?.reason).toBe('충격');
    sync.tick(5, true, 0, 0, 5000);
    const still = sync.get().value;
    sync.reset();
    sync.shock(20, '충격', 0);
    sync.tick(5, false, 0, 0, 5000);
    expect(still).toBeGreaterThan(sync.get().value);
    expect(still).toBeCloseTo(82, 5);
  });

  it('80 위에서는 글리치가 없다', () => {
    sync.shock(10, '긴장', 0);
    let fired = false;
    for (let t = 0; t < 60_000; t += 100) if (sync.tick(0.1, false, 0, 0, t)) fired = true;
    expect(fired).toBe(false);
    expect(sync.get().glitch).toBe(0);
  });

  it('80 아래에서는 글리치가 나고, 낮을수록 잦다', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const count = (drop: number) => {
      sync.reset();
      sync.shock(drop, '충격', 0);
      let n = 0;
      // 회복은 끄고(걷는 셈) 30초 동안 센다 — 걷는 회복 0.2/s 라 30초에 6 오른다
      for (let t = 0; t < 30_000; t += 100) if (sync.tick(0.1, false, 0, 0, t)) n += 1;
      return n;
    };
    const mild = count(24); // 74 부터
    const deep = count(50); // 48 부터
    expect(mild).toBeGreaterThan(0);
    expect(deep).toBeGreaterThan(mild);
    vi.restoreAllMocks();
  });

  it('곁에 AI 가 있으면 글리치를 본다 — 알림에 seen 이 실린다', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const seenLog: boolean[] = [];
    sync.bind((seen) => seenLog.push(seen));
    sync.shock(40, '충격', 0);
    bystanders.set('a', 3, 0);
    for (let t = 0; t < 20_000 && seenLog.length === 0; t += 100) sync.tick(0.1, false, 0, 0, t);
    expect(seenLog[0]).toBe(true);
    expect(sync.get().seen).toBe(true);
    bystanders.set('a', 30, 0);
    const before = seenLog.length;
    for (let t = 20_000; t < 40_000 && seenLog.length === before; t += 100) sync.tick(0.1, false, 0, 0, t);
    expect(seenLog[seenLog.length - 1]).toBe(false);
    vi.restoreAllMocks();
  });

  it('바닥은 5 — 그 아래로는 안 내려간다 (게임 오버는 의심도 몫)', () => {
    sync.shock(500, '손상', 0);
    expect(sync.get().value).toBe(5);
    expect(sync.get().value).toBeLessThan(SYNC_GLITCH);
  });
});
